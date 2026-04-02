import { access, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const claspConfigPath = path.join(rootDir, '.clasp.json');
const claspExamplePath = path.join(rootDir, 'gas', '.clasp.json.example');

function readArgs(argv) {
  return argv.reduce((accumulator, item) => {
    if (!item.startsWith('--')) {
      return accumulator;
    }

    const [key, rawValue] = item.slice(2).split('=');
    accumulator[key] = rawValue ?? 'true';
    return accumulator;
  }, {});
}

function printUsage() {
  process.stdout.write(
    [
      'Usage:',
      '  npm run gas:push -- --script-id=YOUR_SCRIPT_ID',
      '  npm run gas:deploy -- --script-id=YOUR_SCRIPT_ID --description="initial web app deployment"',
      '',
      'Alternative:',
      '  Set GAS_SCRIPT_ID in the terminal before running.',
      '',
      'This helper will:',
      '  1. Build the GAS bundle',
      '  2. Create .clasp.json if missing',
      '  3. Push files with clasp',
      '  4. Optionally create a deployment'
    ].join('\n') + '\n'
  );
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      shell: process.platform === 'win32',
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureClaspInstalled() {
  try {
    await runCommand('clasp', ['--version']);
  } catch {
    throw new Error('clasp is not available in PATH. Install it with npm install -g @google/clasp and run clasp login first.');
  }
}

async function ensureClaspConfig(scriptId) {
  if (await fileExists(claspConfigPath)) {
    process.stdout.write('Using existing .clasp.json\n');
    return;
  }

  if (!scriptId) {
    throw new Error('Missing Apps Script script ID. Pass --script-id=... or set GAS_SCRIPT_ID before running.');
  }

  const template = JSON.parse(await readFile(claspExamplePath, 'utf8'));
  template.scriptId = scriptId;
  await writeFile(claspConfigPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  process.stdout.write('Created .clasp.json from gas/.clasp.json.example\n');
}

const args = readArgs(process.argv.slice(2));

if (args.help || args.h) {
  printUsage();
  process.exit(0);
}

const scriptId = args['script-id'] ?? process.env.GAS_SCRIPT_ID;
const description = args.description ?? `web app deploy ${new Date().toISOString()}`;
const pushOnly = args['push-only'] === 'true';

try {
  await ensureClaspInstalled();
  await runCommand('npm', ['run', 'build:gas']);
  await ensureClaspConfig(scriptId);
  await runCommand('clasp', ['push']);

  if (pushOnly) {
    process.stdout.write('Push complete. Skipping deploy because --push-only was provided.\n');
    process.exit(0);
  }

  await runCommand('clasp', ['deploy', '--description', description]);
  process.stdout.write('Deployment complete.\n');
} catch (error) {
  process.stderr.write(`${error.message || String(error)}\n\n`);
  printUsage();
  process.exit(1);
}