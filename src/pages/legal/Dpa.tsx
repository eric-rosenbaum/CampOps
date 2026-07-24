import { MarkdownDoc } from '@/components/legal/MarkdownDoc';
import content from '../../../docs/legal/DPA.md?raw';

export function Dpa() {
  return <MarkdownDoc content={content} />;
}
