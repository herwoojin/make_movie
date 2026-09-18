import type { Metadata } from 'next';
import { CapabilityReport } from '@/components/landing/CapabilityReport';
import { AccountBox } from '@/components/settings/AccountBox';
import { ByokSettings } from '@/components/settings/ByokSettings';
import { ExportDefaults } from '@/components/settings/ExportDefaults';
import { SaveFolderBox } from '@/components/settings/SaveFolderBox';
import { SidecarBox } from '@/components/settings/SidecarBox';
import { TranslateSettings } from '@/components/settings/TranslateSettings';
import { StorageCleanup } from '@/components/settings/StorageCleanup';
import { TechStackBox } from '@/components/settings/TechStackBox';

export const metadata: Metadata = { title: '설정' };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">설정</h1>
      <ByokSettings />
      <TranslateSettings />
      <ExportDefaults />
      <SaveFolderBox />
      <SidecarBox />
      <StorageCleanup />
      <AccountBox />
      <CapabilityReport />
      <TechStackBox />
    </div>
  );
}
