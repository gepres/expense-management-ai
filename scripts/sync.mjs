/**
 * Sincroniza el paquete canónico hacia los 2 repos consumidores.
 *
 * Flujo de sinergia: este paquete es el ÚNICO lugar donde se edita la
 * lógica IA compartida. `npm run sync`:
 *   1. compila (tsc)
 *   2. empaqueta (npm pack → .tgz)
 *   3. copia el .tgz a gastos-backend/vendor y gastos-firebase-functions/vendor
 * Luego, en cada repo: `npm i` (la dep es `file:vendor/<tgz>`).
 *
 * El .tgz queda commiteado en cada repo → Vercel/Firebase lo suben en su
 * deploy (un `file:../` externo NO funcionaría en esos builds aislados).
 */
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const gepres = resolve(pkgRoot, '..');

const { name, version } = JSON.parse(
  readFileSync(join(pkgRoot, 'package.json'), 'utf8'),
);
const tgz = `${name.replace('@', '').replace('/', '-')}-${version}.tgz`;

const consumers = ['gastos-backend', 'gastos-firebase-functions'];

console.log(`▶ build + pack ${name}@${version}`);
execSync('npm run build', { cwd: pkgRoot, stdio: 'inherit' });
execSync('npm pack', { cwd: pkgRoot, stdio: 'inherit' });

for (const repo of consumers) {
  const vendorDir = join(gepres, repo, 'vendor');
  mkdirSync(vendorDir, { recursive: true });
  // Limpia tarballs viejos del paquete (evita acumular versiones).
  for (const f of readdirSync(vendorDir)) {
    if (/^gastos-expense-ai-.*\.tgz$/.test(f)) {
      rmSync(join(vendorDir, f));
    }
  }
  copyFileSync(join(pkgRoot, tgz), join(vendorDir, tgz));
  console.log(`✔ ${repo}/vendor/${tgz}`);
}

rmSync(join(pkgRoot, tgz));
console.log(
  `\nListo. En cada repo corre:  npm i\n` +
    `(dep esperada: "@gastos/expense-ai": "file:vendor/${tgz}")`,
);
