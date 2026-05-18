// ── Supabase environments — SOURCE OF TRUTH ──────────
// Ce fichier est la source de vérité pour les URLs et clés Supabase.
// L'admin (urban3DQuest-admin/admin.html) en conserve une copie miroir :
//   mettre à jour ici EN PREMIER, puis répercuter dans admin.html.
// ─────────────────────────────────────────────────────
const SUPABASE_ENVS = {
  prod: {
    label: 'PROD',
    url: 'https://jocfvobqfpygixrawnbq.supabase.co',
    key: 'sb_publishable_M8SxhXrmh17vrOf1WlOM6Q_ZNKNqQhM'
  },
  stg: {
    label: 'STG',
    url: 'https://uuofsgcwznuwcsaqsmzc.supabase.co',
    key: 'sb_publishable_LzvsvuvfbJvIL8eynQIC4A_dbJ9A2CF'
  }
};
