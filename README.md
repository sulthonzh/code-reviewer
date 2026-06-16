# AI Code Reviewer

An AI-powered GitHub Action for automated code review using Z.AI. Features secret scanning, quality gates, auto-merge, and auto-release capabilities.

## Features

- 🔍 **Secret Scanning**: Detect hardcoded secrets, API keys, and sensitive information
- 🤖 **AI-Powered Reviews**: Intelligent code analysis using Z.AI models
- 🚦 **Quality Gates**: Automated quality assessment with configurable thresholds
- 🔄 **Auto-Merge**: Automatically merge PRs that pass quality checks
- 🚀 **Auto-Release**: Create and release releases based on semantic versioning

## Usage

```yaml
name: AI Code Review
on:
  pull_request:
    branches: [ main ]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: sulthonzh/code-reviewer@main
        with:
          command: ai-review
          model: glm-4.5
          project-type: auto
```

## Commands

- `secret-scan`: Scan for secrets and sensitive information
- `detect-context`: Detect project type and context
- `ai-review`: Perform AI-powered code review
- `quality-gate`: Check if quality requirements are met
- `auto-merge`: Automatically merge approved PRs
- `auto-release`: Create and publish releases
- `post-status`: Post status updates

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `command` | Command to execute | Required |
| `model` | Z.AI model to use | `glm-4.5` |
| `project-type` | Project type detection | `auto` |
| `zai-api-key` | Z.AI API key | `''` |
| `github-token` | GitHub token | `''` |
| `reviewer-pat` | GitHub PAT for reviews | `''` |
| `app-id` | GitHub App ID | `''` |
| `app-private-key` | GitHub App private key | `''` |

## Outputs

| Output | Description |
|--------|-------------|
| `approved` | Whether PR was approved |
| `model` | Model used for review |
| `project_type` | Detected project type |
| `found` | Whether secrets were found |
| `count` | Number of secrets found |
| `complexity` | Detected complexity level |
| `passed` | Whether quality gate passed |

## Development

```bash
# Install dependencies
npm ci

# Build the project
npm run build

# Run tests
npm test

# Bundle for production
npm run bundle
```

## License

MIT - see LICENSE file for details.