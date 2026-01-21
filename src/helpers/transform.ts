import fg from 'fast-glob';
import fs from 'fs-extra';
import path from 'path';
import { spinner } from '@clack/prompts';
import color from 'picocolors';
import YAML from 'yaml';
import type { PackageManager } from '../utils/package-manager.js';

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

/**
 * Sort dependencies alphabetically in a package.json object
 */
function sortPackageJsonDependencies(pkg: PackageJson): void {
  const depTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
  
  for (const depType of depTypes) {
    const deps = pkg[depType];
    if (deps && typeof deps === 'object') {
      const sorted = Object.keys(deps)
        .sort()
        .reduce((acc, key) => {
          acc[key] = deps[key]!;
          return acc;
        }, {} as Record<string, string>);
      pkg[depType] = sorted;
    }
  }
}

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
    
    // Sort dependencies in all package.json files after replacing scope
    s.message('Sorting dependencies alphabetically...');
    const packageJsonFiles = await fg('**/package.json', {
      cwd: projectDir,
      ignore: ['**/node_modules/**'],
      absolute: true,
    });

    await Promise.all(
      packageJsonFiles.map(async (file) => {
        try {
          const pkg: PackageJson = await fs.readJson(file);
          sortPackageJsonDependencies(pkg);
          await fs.writeJson(file, pkg, { spaces: 2 });
        } catch (e) {
          // Ignore errors for malformed package.json files
        }
      })
    );
    
    s.stop(`Replaced scope with ${color.cyan(newScope)} and sorted dependencies`);
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

interface PnpmWorkspace {
  packages?: string[];
  catalog?: Record<string, string>;
  catalogs?: Record<string, Record<string, string>>;
  overrides?: Record<string, string>;
}

interface PackageJson {
  name?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  pnpm?: {
    overrides?: Record<string, string>;
    [key: string]: unknown;
  };
  overrides?: Record<string, string>;
  resolutions?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Resolves a version string that may contain catalog: or workspace: protocols
 */
function resolveVersion(
  packageName: string,
  version: string,
  defaultCatalog: Record<string, string>,
  namedCatalogs: Record<string, Record<string, string>>
): string {
  // Handle catalog: (default catalog)
  if (version === 'catalog:') {
    const resolved = defaultCatalog[packageName];
    if (resolved) {
      return resolved;
    }
    // If not found in catalog, keep original (will likely fail at install)
    return version;
  }

  // Handle catalog:catalogName (named catalog)
  if (version.startsWith('catalog:')) {
    const catalogName = version.slice('catalog:'.length);
    const catalog = namedCatalogs[catalogName];
    if (catalog && catalog[packageName]) {
      return catalog[packageName];
    }
    // If not found in named catalog, keep original
    return version;
  }

  // Handle workspace:* or workspace:^ etc.
  if (version.startsWith('workspace:')) {
    return '*';
  }

  return version;
}

/**
 * Resolves catalog versions in an overrides/resolutions object
 */
function resolveOverrides(
  overrides: Record<string, string>,
  defaultCatalog: Record<string, string>,
  namedCatalogs: Record<string, Record<string, string>>
): Record<string, string> {
  const resolved: Record<string, string> = {};
  
  for (const [pkg, version] of Object.entries(overrides)) {
    resolved[pkg] = resolveVersion(pkg, version, defaultCatalog, namedCatalogs);
  }
  
  return resolved;
}

/**
 * Resolves pnpm catalog versions in all package.json files when using a non-pnpm package manager.
 * 
 * This transform:
 * 1. Parses pnpm-workspace.yaml to extract catalog version mappings
 * 2. Replaces catalog: and catalog:name versions with actual versions in all package.json files
 * 3. Replaces workspace:* references with *
 * 4. Converts pnpm.overrides to overrides (npm/bun) or resolutions (yarn)
 * 5. Removes the packageManager field from root package.json
 * 6. Deletes pnpm-workspace.yaml
 */
export async function resolveCatalogVersions(
  projectDir: string,
  packageManager: PackageManager
) {
  const s = spinner();
  s.start('Resolving pnpm catalog versions...');

  try {
    // 1. Parse pnpm-workspace.yaml
    const workspaceYamlPath = path.join(projectDir, 'pnpm-workspace.yaml');
    
    if (!(await fs.pathExists(workspaceYamlPath))) {
      s.stop('No pnpm-workspace.yaml found, skipping catalog resolution');
      return;
    }

    const workspaceContent = await fs.readFile(workspaceYamlPath, 'utf8');
    const workspace: PnpmWorkspace = YAML.parse(workspaceContent);

    const defaultCatalog = workspace.catalog ?? {};
    const namedCatalogs = workspace.catalogs ?? {};

    // 2. Find all package.json files
    const packageJsonFiles = await fg('**/package.json', {
      cwd: projectDir,
      ignore: ['**/node_modules/**'],
      absolute: true,
    });

    let totalResolved = 0;

    // 3. Process each package.json
    for (const filePath of packageJsonFiles) {
      const pkg: PackageJson = await fs.readJson(filePath);
      let modified = false;
      const relativePath = path.relative(projectDir, filePath);

      // Process all dependency types
      const depTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
      
      for (const depType of depTypes) {
        const deps = pkg[depType];
        if (deps) {
          for (const [name, version] of Object.entries(deps)) {
            const resolved = resolveVersion(name, version, defaultCatalog, namedCatalogs);
            if (resolved !== version) {
              deps[name] = resolved;
              modified = true;
              totalResolved++;
            }
          }
        }
      }

      // 4. Handle pnpm.overrides
      if (pkg.pnpm?.overrides) {
        const resolvedOverrides = resolveOverrides(
          pkg.pnpm.overrides,
          defaultCatalog,
          namedCatalogs
        );

        if (packageManager === 'yarn') {
          // Yarn uses 'resolutions'
          pkg.resolutions = { ...(pkg.resolutions ?? {}), ...resolvedOverrides };
        } else {
          // npm and bun use 'overrides'
          pkg.overrides = { ...(pkg.overrides ?? {}), ...resolvedOverrides };
        }

        // Remove pnpm-specific field
        delete pkg.pnpm;
        modified = true;
        s.message(`Converted pnpm.overrides in ${color.cyan(relativePath)}`);
      }

      // 5. Remove packageManager field from root package.json
      if (relativePath === 'package.json' && pkg.packageManager) {
        delete pkg.packageManager;
        modified = true;
      }

      if (modified) {
        await fs.writeJson(filePath, pkg, { spaces: 2 });
      }
    }

    // 6. Delete pnpm-workspace.yaml
    await fs.remove(workspaceYamlPath);

    s.stop(`Resolved ${color.cyan(totalResolved.toString())} catalog versions`);
  } catch (error) {
    s.stop('Failed to resolve catalog versions');
    throw error;
  }
}

