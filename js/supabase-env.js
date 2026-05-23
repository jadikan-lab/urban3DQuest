// ── Supabase environments — SOURCE OF TRUTH ──────────
// Ce fichier est la source de vérité pour les URLs et clés Supabase.
// L'admin (urban3DQuest-admin/admin.html) en conserve une copie miroir :
//   mettre à jour ici EN PREMIER, puis répercuter dans admin.html.
// ─────────────────────────────────────────────────────
const SUPABASE_ENVS = {
  prod: {
    label: 'PROD',
    url: 'https://uchzuvmfbgxafcziayvg.supabase.co',
    key: 'sb_publishable_nT1dMZd7U4WNLnn4m3scuA_uNXouYXD'
  },
  stg: {
    label: 'STG',
    url: 'https://uuofsgcwznuwcsaqsmzc.supabase.co',
    key: 'sb_publishable_LzvsvuvfbJvIL8eynQIC4A_dbJ9A2CF'
  }
};
