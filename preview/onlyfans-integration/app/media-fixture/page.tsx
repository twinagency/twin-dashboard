"use client";
import VaultUploader from '@/components/onlyfans-preview/VaultUploader';
import VaultAssetPreview from '@/components/onlyfans-preview/VaultAssetPreview';
export default function Fixture(){return <main className="mx-auto max-w-3xl p-4"><h1>Native media test fixture</h1><VaultUploader accountId="acc-a" connectionRevision={1} onChanged={()=>{}}/><VaultAssetPreview accountId="acc-a" mediaId="13" kind="video"/></main>;}
