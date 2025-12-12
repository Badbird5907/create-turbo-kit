import { execa } from 'execa';
import { spinner } from '@clack/prompts';
import { type PackageManager, getInstallCommand } from '../utils/package-manager.js';
import color from 'picocolors';

export async function installDependencies(projectDir: string, packageManager: PackageManager) {
  const s = spinner();
  s.start(`Installing dependencies with ${color.cyan(packageManager)}...`);

  const installCmd = getInstallCommand(packageManager);
  const [command = "npm", ...args] = installCmd.split(' ');

  try {
    await execa(command, args, {
      cwd: projectDir,
    });
    s.stop(`Installed dependencies`);
  } catch (error) {
    s.stop(`Failed to install dependencies`);
    throw error;
  }
}

export async function initializeGit(projectDir: string) {
  const s = spinner();
  s.start('Initializing git repository...');

  try {
    await execa('git', ['init'], {
      cwd: projectDir,
    });
    await execa('git', ['add', '.'], {
      cwd: projectDir,
    });
    await execa('git', ['commit', '-m', 'Initial commit'], {
      cwd: projectDir,
    });

    s.stop('Initialized git repository');
  } catch (error) {
    s.stop('Failed to initialize git repository');
    throw error;
  }
}

