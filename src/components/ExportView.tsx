import { ClipboardCopy, Download, FileJson, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildReport, download, safeName, toPunchListText } from '../lib/export';
import { useStore } from '../store';
import { Btn, Card, Field, TextInput } from './ui';
import { StatusBanner } from './Dashboard';
import type { ValidationResult } from '../lib/validate';

export function ExportView({ v }: { v: ValidationResult }) {
  const project = useStore((s) => s.project);
  const patch = useStore((s) => s.patchProject);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const report = useMemo(() => buildReport(project), [project]);
  const text = useMemo(() => toPunchListText(report), [report]);
  const base = `preflight-${safeName(project.name)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <StatusBanner v={v} empty={project.zones.length === 0} />
        <Card className="grid gap-3 md:grid-cols-3">
          <Field label="Project name">
            <TextInput value={project.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="Site">
            <TextInput value={project.site} onChange={(e) => patch({ site: e.target.value })} />
          </Field>
          <Field label="Engineer">
            <TextInput value={project.engineer} onChange={(e) => patch({ engineer: e.target.value })} />
          </Field>
        </Card>
        <Card className="flex flex-wrap gap-3">
          <Btn variant="primary" onClick={() => download(`${base}.json`, 'application/json', JSON.stringify(report, null, 2))}>
            <FileJson size={20} /> Download JSON
          </Btn>
          <Btn variant="primary" onClick={() => download(`${base}-punchlist.txt`, 'text/plain', text)}>
            <Download size={20} /> Download punch-list
          </Btn>
          <Btn onClick={() => window.print()}>
            <Printer size={20} /> Print or save as PDF
          </Btn>
          <Btn onClick={copy}>
            <ClipboardCopy size={20} /> {copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Copy blocked, select the text' : 'Copy text'}
          </Btn>
        </Card>
      </div>
      <Card className="overflow-x-auto">
        <pre id="print-area" className="whitespace-pre-wrap break-words font-mono text-[0.85rem] leading-relaxed">
          {text}
        </pre>
      </Card>
    </div>
  );
}
