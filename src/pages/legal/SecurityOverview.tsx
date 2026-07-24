import { MarkdownDoc } from '@/components/legal/MarkdownDoc';
import content from '../../../docs/SECURITY.md?raw';

export function SecurityOverview() {
  return <MarkdownDoc content={content} />;
}
