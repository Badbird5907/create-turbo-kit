import fg from 'fast-glob';
import fs from 'fs-extra';
import path from 'path';
import { spinner } from '@clack/prompts';
import color from 'picocolors';

export async function replaceScope(projectDir: string, newScope: string) {
  const s = spinner();
  s.start(`Replacing scope with ${color.cyan(newScope)}...`);

  try {
    const files = await fg('**/*', {
      cwd: projectDir,
      ignore: [
        '**/.git/**',
        '**/node_modules/**',
        '**/.turbo/**',
        '**/dist/**',
        '**/.next/**',
        '**/pnpm-lock.yaml',
        '**/yarn.lock',
        '**/package-lock.json',
        '**/bun.lockb',
      ],
      absolute: true,
    });

    await Promise.all(
      files.map(async (file) => {
        try {
          const content = await fs.readFile(file, 'utf8');
          if (content.includes('@acme')) {
            const newContent = content.replace(/@acme/g, newScope);
            await fs.writeFile(file, newContent);
          }
        } catch (e) {
        }
      })
    );
    
    s.stop(`Replaced scope with ${color.cyan(newScope)}`);
  } catch (error) {
    s.stop('Failed to replace scope');
    throw error;
  }
}

export async function setupEnv(projectDir: string) {
  const envExample = path.join(projectDir, '.env.example');
  const envDest = path.join(projectDir, '.env');

  if (await fs.pathExists(envExample)) {
    await fs.copy(envExample, envDest);
  }
}

