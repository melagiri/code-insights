# Session Context

## User Prompts

### Prompt 1

I tried installing npm g @code-insights/cli multiple times even after uninstalling existing one, but still it downloads and installs v3.0.0 not 3.0.2 which is the latest

### Prompt 2

<bash-input> npm cache clean --force && npm install -g @code-insights/cli</bash-input>

### Prompt 3

<bash-stdout>npm warn using --force Recommended protections disabled.
npm warn deprecated prebuild-install@7.1.3: No longer maintained. Please contact the author of the relevant native addon; alternatives are available.

changed 95 packages in 8s

29 packages are looking for funding
  run `npm fund` for details</bash-stdout><bash-stderr></bash-stderr>

### Prompt 4

<bash-input>code-insights --version</bash-input>

### Prompt 5

<bash-stdout>3.0.0</bash-stdout><bash-stderr></bash-stderr>

### Prompt 6

see it is still 3.0.0

### Prompt 7

yes, Option A

### Prompt 8

yes, do all necessary changes required to bump to 3.0.3 including npm publish and gh release

### Prompt 9

yes

### Prompt 10

[Request interrupted by user]

### Prompt 11

do not stash.. there is a parallel session running

