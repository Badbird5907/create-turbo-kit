import fg from 'fast-glob';
import fs from 'fs-extra';
import path from 'path';
import { spinner } from '@clack/prompts';
import color from 'picocolors';

const DOCKER_CONTAINERS = {
  postgres: {
    label: 'PostgreSQL 16 (Database)',
    services: ['postgres'],
    volumes: ['postgres_data'],
  },
  mailpit: {
    label: 'Mailpit (Email testing)',
    services: ['mailpit'],
    volumes: [],
  },
  minio: {
    label: 'MinIO (S3-compatible storage)',
    services: ['minio', 'minio-create-bucket'],
    volumes: ['minio_data'],
  },
} as const;

export type DockerContainer = keyof typeof DOCKER_CONTAINERS;

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

export function getDockerContainers() {
  return Object.entries(DOCKER_CONTAINERS).map(([value, config]) => ({
    value,
    label: config.label,
  }));
}

export async function deleteDockerCompose(projectDir: string) {
  const s = spinner();
  s.start('Removing Docker Compose setup...');

  try {
    const dockerComposePath = path.join(projectDir, 'docker-compose.yml');
    if (await fs.pathExists(dockerComposePath)) {
      await fs.remove(dockerComposePath);
    }
    s.stop('Removed Docker Compose setup');
  } catch (error) {
    s.stop('Failed to remove Docker Compose setup');
    throw error;
  }
}

export async function configureDockerCompose(projectDir: string, selectedContainers: string[]) {
  const s = spinner();
  s.start('Configuring Docker Compose...');

  try {
    const dockerComposePath = path.join(projectDir, 'docker-compose.yml');
    
    if (!(await fs.pathExists(dockerComposePath))) {
      s.stop('Docker Compose file not found');
      return;
    }

    let content = await fs.readFile(dockerComposePath, 'utf8');

    const allContainers = Object.keys(DOCKER_CONTAINERS) as DockerContainer[];
    const containersToRemove = allContainers.filter(c => !selectedContainers.includes(c));

    for (const container of containersToRemove) {
      const containerRegex = new RegExp(
        `  # -- ${container} --\\n[\\s\\S]*?  # // ${container} //\\n`,
        'g'
      );
      content = content.replace(containerRegex, '');
    }

    content = content.replace(/  # -- \w+ --\n/g, '');
    content = content.replace(/  # \/\/ \w+ \/\/\n/g, '');

    await fs.writeFile(dockerComposePath, content);
    
    s.stop(`Configured Docker Compose with ${color.cyan(selectedContainers.length)} container(s)`);
  } catch (error) {
    s.stop('Failed to configure Docker Compose');
    throw error;
  }
}

