import { execa } from 'execa';
import { spinner } from '@clack/prompts';
import { type PackageManager, getRunner } from '../utils/package-manager.js';
import color from 'picocolors';

export interface ScaffoldOptions {
  projectName: string;
  packageManager: PackageManager;
}

export async function scaffoldProject({ projectName, packageManager }: ScaffoldOptions) {
  const s = spinner();
  s.start(`Scaffolding project in ${color.cyan(projectName)}...`);

  const runner = getRunner(packageManager);
  const [command = 'npx', ...args] = runner.split(' ');
  
  try {
    await execa(command, [
      ...args,
      'create-turbo@latest',
      '-e',
      'https://github.com/Badbird5907/turbo-kit',
      '--package-manager',
      packageManager,
      '--skip-install',
      '--no-git',
      projectName
    ]);
    
    s.stop(`Scaffolded project in ${color.cyan(projectName)}`);
  } catch (error) {
    s.stop(`Failed to scaffold project`);
    throw error;
  }
}

