import type { ContainerTemplate } from '../../src/domain/types';

export const smallTestContainer: ContainerTemplate = {
  id: 'test-container-small',
  name: 'Test Container Small',
  standardType: 'CUSTOM_TRUCK',
  innerLength: 2000,
  innerWidth: 1000,
  innerHeight: 1000,
  maxPayload: 500,
  isCustom: true,
};
