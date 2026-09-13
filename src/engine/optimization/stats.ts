import type { ContainerInstance, ContainerTemplate, SolutionStats, UnfitCargo } from '../../domain/types';

export function computeSolutionStats(
  containers: ContainerInstance[],
  templatesById: Map<string, ContainerTemplate>,
): SolutionStats {
  let totalInnerVolume = 0;
  let totalMaxPayload = 0;
  let totalUsedVolume = 0;
  let totalWeight = 0;
  let totalCost = 0;

  for (const container of containers) {
    const template = templatesById.get(container.templateId);
    if (!template) continue;
    totalInnerVolume += template.innerLength * template.innerWidth * template.innerHeight;
    totalMaxPayload += template.maxPayload;
    totalUsedVolume += container.usedVolume;
    totalWeight += container.totalWeight;
    totalCost += template.costPerTrip ?? 0;
  }

  return {
    volumeFillPercent: totalInnerVolume === 0 ? 0 : (totalUsedVolume / totalInnerVolume) * 100,
    payloadUsagePercent: totalMaxPayload === 0 ? 0 : (totalWeight / totalMaxPayload) * 100,
    containerCount: containers.length,
    totalCost,
  };
}

export function hasUnfitCargo(unfitCargo: UnfitCargo[]): boolean {
  return unfitCargo.length > 0;
}
