// Registry of every JSON-file-backed collection the backend exposes through
// the generic /api/data/:name endpoints, plus the access rules for each:
//   - adminOnly: only an admin token may read or write this collection.
//   - patientFilterField: when set, a patient token may read this
//     collection too, but only the rows where this field equals their own
//     patient id (never the whole collection, and never via PUT).
//   - stripFields: fields removed from every row before a response is sent
//     (used to make sure password hashes never leave the server).

const COLLECTIONS = {
  patients: { file: 'patients.json', default: [], adminOnly: true },
  'treatment-plans': { file: 'treatment-plans.json', default: [], adminOnly: true },
  'clinical-notes': { file: 'clinical-notes.json', default: [], adminOnly: true },
  staff: { file: 'staff.json', default: [], adminOnly: true },
  media: { file: 'media.json', default: [], adminOnly: true },
  'follow-ups': { file: 'follow-ups.json', default: [], adminOnly: false, patientFilterField: 'patientId' },
  'consent-forms': { file: 'consent-forms.json', default: [], adminOnly: false, patientFilterField: 'patientId' },
  'medical-reports': { file: 'medical-reports.json', default: [], adminOnly: false, patientFilterField: 'patientId' },
  'insurance-billings': { file: 'insurance-billings.json', default: [], adminOnly: false, patientFilterField: 'patientId' },
  'portal-patients': { file: 'portal-patients.json', default: [], adminOnly: true, stripFields: ['password'] },
};

module.exports = { COLLECTIONS };
