export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export function getRunner(pm: PackageManager): string {
  switch (pm) {
    case 'npm':
      return 'npx';
    case 'pnpm':
      return 'pnpm dlx';
    case 'yarn':
      return 'yarn dlx';
    case 'bun':
      return 'bunx';
    default:
      return 'npx';
  }
}

export function getInstallCommand(pm: PackageManager): string {
  switch (pm) {
    case 'npm':
      return 'npm install';
    case 'pnpm':
      return 'pnpm install';
    case 'yarn':
      return 'yarn install';
    case 'bun':
      return 'bun install';
    default:
      return 'npm install';
  }
}

