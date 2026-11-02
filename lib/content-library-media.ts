import 'server-only';
import { supabaseAdmin } from './supabase';
import { defaultListings, type LibraryItem } from '../components/content-library/model';

// Explicit mapping from the presentation creator to her existing media owner.
// Called only after the Content Library's internal-admin and view-as guards.
const BRIANNA_CLONE = '0328e7b3-a1e5-465a-9a30-c9cf6519cba1';
export async function loadBriannaLibraryMedia(selectedItem = ''): Promise<LibraryItem[]> {
  const { data, error } = await supabaseAdmin.from('photos')
    .select('id,image_name,storage_path,star_value,created_at')
    .eq('clone_id', BRIANNA_CLONE).order('created_at', { ascending: false }).limit(18);
  if (error) throw new Error('Brianna’s media library could not be loaded.');
  const rows = (data || []).filter(row => typeof row.storage_path === 'string' && row.storage_path.startsWith(`${BRIANNA_CLONE}/`));
  // A Dashboard tile can link to an older vault photo outside the first page.
  // Keep the default eighteen uploads unchanged; fetch only that owned photo.
  const selectedId = /^briana:source:photo:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(selectedItem)?.[1];
  if (selectedId && !rows.some(row => row.id === selectedId)) {
    const selected = await supabaseAdmin.from('photos')
      .select('id,image_name,storage_path,star_value,created_at')
      .eq('clone_id', BRIANNA_CLONE).eq('id', selectedId).maybeSingle();
    if (selected.error) throw new Error('The selected library photo could not be loaded.');
    const row = selected.data;
    if (row?.id === selectedId && typeof row.storage_path === 'string' && row.storage_path.startsWith(`${BRIANNA_CLONE}/photos/`) && !row.storage_path.split('/').includes('..')) rows.unshift(row);
  }
  if (!rows.length) return [];
  const signed = await supabaseAdmin.storage.from('media').createSignedUrls(rows.map(row => row.storage_path), 3600);
  if (signed.error) throw new Error('Brianna’s media previews could not be loaded.');
  return rows.flatMap(row => {
    const preview = signed.data?.find(entry => entry.path === row.storage_path && !entry.error)?.signedUrl;
    if (!preview) return [];
    const fileName = String(row.image_name || row.storage_path.split('/').at(-1));
    const title = fileName.split('__').at(-1)!.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    const listings = defaultListings('Photo');
    listings.telegram = { enabled: true, price: Number(row.star_value) || 250 };
    return [{ id: `briana:source:photo:${row.id}`, creatorId: 'briana', title, originalTitle: title,
      kind: 'Photo' as const, description: `Original photo from Brianna’s content library. Source file: ${fileName}.`,
      collection: 'Original uploads', tags: ['photo', 'original upload'], status: 'Published' as const,
      addedAt: row.created_at, listings, members: [], preview, fileName, activity: [],
    }];
  });
}
