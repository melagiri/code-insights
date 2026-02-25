import { Command } from 'commander';
import { applySharedFlags, parseFlags } from './shared.js';
import type { StatsFlags } from './shared.js';

// Wrapper that parses flags before calling the action
function wrapAction(actionFn: (flags: StatsFlags) => Promise<void>) {
  return async (options: Record<string, unknown>) => {
    const flags = parseFlags(options);
    await actionFn(flags);
  };
}

// Lazy import actions to avoid loading everything at module load time
async function overviewAction(flags: StatsFlags): Promise<void> {
  const { overviewAction: action } = await import('./actions/overview.js');
  return action(flags);
}

async function costAction(flags: StatsFlags): Promise<void> {
  const { costAction: action } = await import('./actions/cost.js');
  return action(flags);
}

async function projectsAction(flags: StatsFlags): Promise<void> {
  const { projectsAction: action } = await import('./actions/projects.js');
  return action(flags);
}

async function todayAction(flags: StatsFlags): Promise<void> {
  const { todayAction: action } = await import('./actions/today.js');
  return action(flags);
}

async function modelsAction(flags: StatsFlags): Promise<void> {
  const { modelsAction: action } = await import('./actions/models.js');
  return action(flags);
}

const costCommand = applySharedFlags(
  new Command('cost').description('Cost breakdown by project, model, and time period')
).action(wrapAction(costAction));

const projectsCommand = applySharedFlags(
  new Command('projects').description('Per-project detail — sessions, time, cost, models')
).action(wrapAction(projectsAction));

const todayCommand = applySharedFlags(
  new Command('today').description("Today's sessions with titles, duration, cost")
).action(wrapAction(todayAction));

const modelsCommand = applySharedFlags(
  new Command('models').description('Model usage distribution, cost per model, trends')
).action(wrapAction(modelsAction));

export const statsCommand = applySharedFlags(
  new Command('stats')
    .description('View usage statistics and analytics')
    .addCommand(costCommand)
    .addCommand(projectsCommand)
    .addCommand(todayCommand)
    .addCommand(modelsCommand)
).action(wrapAction(overviewAction));
