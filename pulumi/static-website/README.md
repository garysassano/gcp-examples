# pulumi-static-website

Pulumi app that hosts a static website in a public Cloud Storage bucket.

## Prerequisites

- **_GCP:_**
  - Must have authenticated with [Application Default Credentials](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment) in your local environment.
- **_Pulumi:_**
  - Must be logged in to a Pulumi backend (`pulumi login`).
- **_mise:_**
  - [Install mise](https://mise.jdx.dev/installing-mise.html), which manages Node, pnpm, and Pulumi.

## Installation

```sh
mise install
pnpm install
pulumi stack init dev
pulumi config set gcp:project <GCP_PROJECT_ID>
```

## Deployment

```sh
pnpm run deploy
```

The `websiteUrl` output is the public URL of `index.html`.

## Cleanup

```sh
pnpm destroy
```

## How it works

`src/website.ts` creates a uniform-access bucket, grants `allUsers` read access to its objects, and uploads `public/index.html`. `src/index.ts` is the Pulumi entrypoint.

Pulumi's built-in TypeScript support cannot load TypeScript 7, so `Pulumi.yaml` turns it off and runs the program through `tsx`. The tests run the same program against Pulumi's mock runtime, so they need no cloud credentials.
