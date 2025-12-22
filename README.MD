# create-turbo-kit

This is the CLI script for quickly bootstrapping a new [Turbo Kit](https://github.com/Badbird5907/turbo-kit) project.

## Usage

```bash
pnpm create turbo-kit@latest
```


## How it works
This script uses the `create-turbo` command under the hood to quickly scaffold a new Turbo Kit project.
It then applies some code transformations on top of the scaffolded project to make it ready for development.

See [transform.ts](./src/helpers/transform.ts) for more details.
