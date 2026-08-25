import { MarkdownDoc } from '@/components/legal/MarkdownDoc';
import content from '../../../docs/legal/SUPPORT.md?raw';

export function Support() {
  return <MarkdownDoc content={content} />;
}
