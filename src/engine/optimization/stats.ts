import { computeDunnageGaps, summarizeDunnage } from './dunnage';
import { partialPalletsOf, countLooseBoxes, countPlacementBoxes, countPlacementPallets, expandToBoxPlacements } from '../palletizing/palletBoxes';
import type { ContainerInstance, ContainerTemplate, SolutionStats, UnfitCargo } from '../../domain/types';

export function computeSolutionStats(
  containers: ContainerInstance[],
  templatesById: Map<string, ContainerTemplate>,
): SolutionStats {
  let totalInnerVolume = 0;
  let totalMaxPayload = 0;
  let totalUsedVolume = 0;
  let totalWeight = 0;
  let boxCount = 0;
  let palletCount = 0;
  let looseBoxCount = 0;
  let airbagCount = 0;
  let partialPalletCount = 0;
  let partialPalletBoxCount = 0;
  let boxVolume = 0;

  for (const container of containers) {
    const template = templatesById.get(container.templateId);
    if (!template) continue;
    totalInnerVolume += template.innerLength * template.innerWidth * template.innerHeight;
    totalMaxPayload += template.maxPayload;
    totalUsedVolume += container.usedVolume;
    totalWeight += container.totalWeight;
    boxCount += countPlacementBoxes(container.placements);
    palletCount += countPlacementPallets(container.placements);
    looseBoxCount += countLooseBoxes(container.placements);
    for (const p of partialPalletsOf(container.placements)) {
      partialPalletCount += 1;
      partialPalletBoxCount += p.palletLoad?.boxCount ?? 0;
    }
    airbagCount += summarizeDunnage(computeDunnageGaps(container.placements, template)).airbags;
    for (const box of expandToBoxPlacements(container.placements)) boxVolume += box.length * box.width * box.height;
  }

  return {
    volumeFillPercent: totalInnerVolume === 0 ? 0 : (totalUsedVolume / totalInnerVolume) * 100,
    payloadUsagePercent: totalMaxPayload === 0 ? 0 : (totalWeight / totalMaxPayload) * 100,
    containerCount: containers.length,
    boxCount,
    palletCount,
    looseBoxCount,
    airbagCount,
    partialPalletCount,
    partialPalletBoxCount,
    boxVolumeFillPercent: totalInnerVolume === 0 ? 0 : (boxVolume / totalInnerVolume) * 100,
  };
}

export function hasUnfitCargo(unfitCargo: UnfitCargo[]): boolean {
  return unfitCargo.length > 0;
}
