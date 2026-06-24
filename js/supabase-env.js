// ── Supabase environments — SOURCE OF TRUTH ──────────
// Ce fichier est la source de vérité pour les URLs et clés Supabase.
// L'admin (urban3DQuest-admin/admin.html) en conserve une copie miroir :
//   mettre à jour ici EN PREMIER, puis répercuter dans admin.html.
// ─────────────────────────────────────────────────────
const SUPABASE_ENVS = {
  prod: {
    label: 'PROD',
    url: 'https://tjgcxxbpdwuijezlsfgk.supabase.co',
    key: 'sb_publishable_C8PHMI--yhY3PQsy3j0_Bg_xzCOgN-0'
  },
  stg: {
    label: 'STG',
    url: 'https://tjgcxxbpdwuijezlsfgk.supabase.co',
    key: 'sb_publishable_C8PHMI--yhY3PQsy3j0_Bg_xzCOgN-0'
  }
};
