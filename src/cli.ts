import { intro, outro, text, select, isCancel, cancel, confirm } from '@clack/prompts';
import { Command } from 'commander';
import color from 'picocolors';
import fs from 'fs-extra';
import path from 'path';
import { replaceScope, setupEnv } from './helpers/transform.js';
import { installDependencies } from './helpers/install.js';
import { type PackageManager } from './utils/package-manager.js';
import { scaffoldProject } from './helpers/scaffold.js';

async function main() {
  const program = new Command();
  
  program
    .name('create-turbo-kit')
    .description('Initialize a custom turborepo template')
    .argument('[project-name]', 'Name of the project directory')
    .parse(process.argv);

  const args = program.args;
  let projectName = args[0];

  console.log();
  intro(color.bgCyan(color.black(' Create Turbo Kit ')));

  if (!projectName) {
    const pName = await text({
      message: 'What is your project named?',
      placeholder: 'my-turbo-app',
      validate: (value) => {
        if (!value) return 'Please enter a name.';
        if (/[^a-zA-Z0-9-_]/.test(value)) return 'Project name can only contain letters, numbers, dashes and underscores.';
      },
    });

    if (isCancel(pName)) {
      cancel('Operation cancelled.');
      process.exit(0);
    }
    projectName = pName as string;
  }

  const projectDir = path.resolve(process.cwd(), projectName);

  if (await fs.pathExists(projectDir)) {
    const shouldOverwrite = await confirm({
      message: `Directory ${projectName} already exists. Do you want to overwrite it?`,
      initialValue: false,
    });

    if (isCancel(shouldOverwrite) || !shouldOverwrite) {
      cancel('Operation cancelled.');
      process.exit(0);
    }
    
    await fs.remove(projectDir);
  }

  const packageManager = await select({
    message: 'Which package manager do you want to use?',
    options: [
      { value: 'pnpm', label: 'pnpm' },
      { value: 'npm', label: 'npm' },
      { value: 'yarn', label: 'yarn' },
      { value: 'bun', label: 'bun' },
    ],
  });

  if (isCancel(packageManager)) {
    cancel('Operation cancelled.');
    process.exit(0);
  }

  const getScope = async (): Promise<string> => {
    const scope = await text({
      message: 'What is your package scope?',
      placeholder: '@my-org',
      validate: (value) => {
        if (!value) return 'Please enter a scope.';
      },
    });
  
    if (isCancel(scope)) {
      cancel('Operation cancelled.');
      process.exit(0);
    }

    const check = ["@", "~", "$", "#", "!"];
    if (!check.includes(scope[0] as string)) {
      // ask the user to confirm this is the correct scope
      const importStatement = `${color.magenta("import")} ${color.yellow("{")} ${color.cyan("example")} ${color.yellow("}")} ${color.magenta("from")} ${color.cyan(`"${scope}/example"`)}`;
      const confirmScope = await confirm({
        message: `Is ${color.cyan(scope)} the correct scope?\nYour import statements will look like this: ${importStatement}`,
        initialValue: true,
      });
      if (isCancel(confirmScope) || !confirmScope) {
        return await getScope();
      }
    }

    return scope as string;
  }
  const scope = await getScope();

  try {
    await scaffoldProject({
      projectName,
      packageManager: packageManager as PackageManager,
    });

    await replaceScope(projectDir, scope as string);
    await setupEnv(projectDir);
    await installDependencies(projectDir, packageManager as PackageManager);

    outro(color.green('Project initialized successfully!'));
    
    console.log(`To get started:`);
    console.log(color.cyan(`  cd ${projectName}`));
    console.log(color.cyan(`  ${packageManager} run dev`));
    
    console.log();
    console.log(color.greenBright("Happy Hacking!"))
  } catch (error) {
    console.error(color.red('An error occurred:'), error);
    process.exit(1);
  }
}

main().catch(console.error);
