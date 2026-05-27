/**
 * One-shot setup: generates schema, migrates the DB, creates the first admin.
 *
 *   tsx scripts/setup.ts you@example.com YourStrongPassword
 */
import { spawnSync } from 'node:child_process';
function run(cmd, args) {
    console.log(`\n▶ ${cmd} ${args.join(' ')}`);
    const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0)
        process.exit(r.status ?? 1);
}
const [, , email, password] = process.argv;
run('npm', ['run', 'schema:build']);
run('npx', ['prisma', 'generate']);
run('npx', ['prisma', 'migrate', 'deploy']);
if (email && password) {
    run('npm', ['run', 'admin:create', '--', email, password]);
}
else {
    console.log('\n(ℹ️  pass <email> <password> to also create the first admin user)');
}
console.log('\n✅ Setup complete. Start the API with: npm run dev');
//# sourceMappingURL=setup.js.map