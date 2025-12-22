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
    dependsOn: [], 
  },
  pgadmin: {
    label: `pgAdmin 4.9 (Database management) [Depends on PostgreSQL]`,
    services: ['pgadmin'],
    volumes: [],
    dependsOn: ['postgres'],
  },
  redis: {
    label: 'Redis (Caching)',
    services: ['redis'],
    volumes: [],
    dependsOn: [],
  },
  mailpit: {
    label: 'Mailpit (Email testing)',
    services: ['mailpit'],
    volumes: [],
    dependsOn: [],
  },
  minio: {
    label: 'MinIO (S3-compatible storage)',
    services: ['minio', 'minio-create-bucket'],
    volumes: ['minio_data'],
    dependsOn: [],
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
      s.message(`Removed ${color.cyan(dockerComposePath)}`);
    }
    const dockerDir = path.join(projectDir, 'docker');
    if (await fs.pathExists(dockerDir)) {
      await fs.remove(dockerDir);
      s.message(`Removed ${color.cyan(dockerDir)}`);
    }
    s.stop('Removed Docker Compose setup');
  } catch (error) {
    s.stop('Failed to remove Docker Compose setup');
    throw error;
  }
}

function resolveContainerDependencies(selectedContainers: string[]): string[] {
  const resolved = new Set<string>(selectedContainers);
  const queue = [...selectedContainers];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const config = DOCKER_CONTAINERS[current as DockerContainer];
    
    if (config && config.dependsOn) {
      for (const dep of config.dependsOn) {
        if (!resolved.has(dep)) {
          resolved.add(dep);
          queue.push(dep);
        }
      }
    }
  }

  return Array.from(resolved);
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

    const resolvedContainers = resolveContainerDependencies(selectedContainers);
    const addedDependencies = resolvedContainers.filter(c => !selectedContainers.includes(c));
    
    if (addedDependencies.length > 0) {
      s.message(`Auto-including dependencies: ${color.cyan(addedDependencies.join(', '))}`);
    }

    let content = await fs.readFile(dockerComposePath, 'utf8');

    const allContainers = Object.keys(DOCKER_CONTAINERS) as DockerContainer[];
    const containersToRemove = allContainers.filter(c => !resolvedContainers.includes(c));

    for (const container of containersToRemove) {
      const containerRegex = new RegExp(
        `  # -- ${container} --\\n[\\s\\S]*?  # // ${container} //\\n`,
        'g'
      );
      content = content.replace(containerRegex, '');

      // delete `./docker/<container>/`
      const dockerDirPath = path.join(projectDir, 'docker', container);
      if (await fs.pathExists(dockerDirPath)) {
        await fs.remove(dockerDirPath);
        s.message(`Removed ${color.cyan(dockerDirPath)}`);
      }
    }

    content = content.replace(/  # -- \w+ --\n/g, '');
    content = content.replace(/  # \/\/ \w+ \/\/\n/g, '');

    await fs.writeFile(dockerComposePath, content);

    // check if `./docker/` is empty
    const dockerDir = path.join(projectDir, 'docker');
    if (await fs.pathExists(dockerDir) && (await fs.readdir(dockerDir)).length === 0) {
      await fs.remove(dockerDir);
      s.message(`Removed ${color.cyan(dockerDir)} ${color.gray('(because it was empty)')}`);
    }
    
    s.stop(`Configured Docker Compose with ${color.cyan(resolvedContainers.length)} container(s)`);
  } catch (error) {
    s.stop('Failed to configure Docker Compose');
    throw error;
  }
}

export async function removePackages(
  packages: string[],
  packagePath: string,
  projectDir: string,
  s?: ReturnType<typeof spinner>
) {
  const packageJsonPath = path.join(projectDir, packagePath, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    const packageJson = await fs.readJson(packageJsonPath);
    let hasChanges = false;

    for (const dep of packages) {
      if (packageJson.dependencies && packageJson.dependencies[dep]) {
        delete packageJson.dependencies[dep];
        hasChanges = true;
        if (s) {
          s.message(`Removed ${color.cyan(dep)} from ${packagePath}/package.json`);
        }
      }
    }

    if (hasChanges) {
      await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    }
  }
}

export async function removeReactEmail(projectDir: string) {
  const s = spinner();
  s.start('Removing react-email...');

  try {
    // remove email package
    const emailPackagePath = path.join(projectDir, 'packages', 'email');
    if (await fs.pathExists(emailPackagePath)) {
      await fs.remove(emailPackagePath);
      s.message(`Removed ${color.cyan(emailPackagePath)}`);
    }

    // remove @react-email/components from packages/api/package.json
    await removePackages(['@react-email/components', '@acme/email'], 'packages/api', projectDir, s);

    s.stop('Removed react-email');
  } catch (error) {
    s.stop('Failed to remove react-email');
    throw error;
  }
}

