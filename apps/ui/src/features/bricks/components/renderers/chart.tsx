import { BrickChart } from '../BrickChart';
import { defineRenderer } from './registry';

defineRenderer('chart', ({ node }) => {
  return <BrickChart node={node} />;
});
