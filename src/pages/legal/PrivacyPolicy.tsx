import { MarkdownDoc } from '@/components/legal/MarkdownDoc';
import content from '../../../docs/legal/PRIVACY_POLICY.md?raw';

export function PrivacyPolicy() {
  return <MarkdownDoc content={content} />;
}
