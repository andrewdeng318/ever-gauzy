#!/usr/bin/env node
// Turns the static files of the upstream `gauzy-webapp` image into a Vercel
// Build Output API directory (`.vercel/output`), deployable with
// `vercel deploy --prebuilt`.
//
// It applies the same placeholder substitution as `.deploy/webapp/entrypoint.prod.sh`:
// every `s#DOCKER_X#$X#g` rule from `replacements.sed` is applied to the top-level
// `*.js` files, with `$X` taken from the env files (later files win, unset = empty).
//
// Usage: node prepare-webapp.mjs <dist-dir> <replacements.sed> <out-dir> <env-file>...

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [distDir, sedFile, outDir, ...envFiles] = process.argv.slice(2);
if (!distDir || !sedFile || !outDir || envFiles.length === 0) {
	console.error('Usage: node prepare-webapp.mjs <dist-dir> <replacements.sed> <out-dir> <env-file>...');
	process.exit(1);
}

const env = {};
for (const file of envFiles) {
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		let value = match[2].trim();
		if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
		env[match[1]] = value;
	}
}

// Each rule looks like `s#DOCKER_API_BASE_URL#$API_BASE_URL#g` (delimiter `#` or `|`).
const rules = readFileSync(sedFile, 'utf8')
	.split('\n')
	.map((line) => line.trim())
	.filter((line) => line.startsWith('s'))
	.map((line) => {
		const delimiter = line[1];
		const [, from, to] = line.split(delimiter);
		return { from, to: to.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => env[name] ?? '') };
	});

const staticDir = join(outDir, 'static');
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(staticDir, { recursive: true });
cpSync(distDir, staticDir, { recursive: true });
for (const helper of ['entrypoint.compose.sh', 'entrypoint.prod.sh', 'replacements.sed']) {
	rmSync(join(staticDir, helper), { force: true });
}

let replaced = 0;
for (const name of readdirSync(staticDir).filter((file) => file.endsWith('.js'))) {
	const path = join(staticDir, name);
	let source = readFileSync(path, 'utf8');
	const original = source;
	for (const { from, to } of rules) source = source.split(from).join(to);
	if (source !== original) {
		writeFileSync(path, source);
		replaced++;
	}
}

// Same routing as `.deploy/webapp/nginx.prod.conf`: real files first, SPA fallback otherwise.
writeFileSync(
	join(outDir, 'config.json'),
	JSON.stringify(
		{
			version: 3,
			routes: [
				{ src: '/index.html', headers: { 'cache-control': 'no-cache' }, continue: true },
				{ handle: 'filesystem' },
				{ src: '/assets/(.*)', status: 404 },
				{ src: '/(.*)', dest: '/index.html', headers: { 'cache-control': 'no-cache' } }
			]
		},
		null,
		2
	)
);

console.log(`Prepared ${staticDir}: ${rules.length} rules, ${replaced} JS files changed`);
