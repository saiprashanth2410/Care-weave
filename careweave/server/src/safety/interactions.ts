// Drug-drug interaction rules. A rule names two groups of molecules; every molecule of one group interacts with every molecule of the
// other. `expandRules` turns them into the flat pair list the checker uses. Still a hand-written reference list, not a clinical database:
// it covers widely documented major interactions, and it has not been clinically validated.

export type Interaction = { drugA: string; drugB: string; riskDescription: string };
type Rule = { a: string[]; b: string[]; risk: string };

const NSAIDS = ['ibuprofen', 'diclofenac', 'naproxen', 'ketorolac', 'aceclofenac', 'etoricoxib', 'nimesulide', 'piroxicam', 'indomethacin', 'celecoxib'];
const SSRIS = ['fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'escitalopram'];
const ACE_ARB = ['lisinopril', 'enalapril', 'ramipril', 'perindopril', 'losartan', 'telmisartan', 'valsartan', 'olmesartan'];
const BENZOS = ['diazepam', 'alprazolam', 'lorazepam', 'clonazepam'];
const OPIOIDS = ['tramadol', 'codeine', 'morphine', 'tapentadol'];
const QT = ['azithromycin', 'clarithromycin', 'ondansetron', 'haloperidol', 'amiodarone', 'levofloxacin', 'moxifloxacin'];
const FLUOROQUINOLONES = ['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'ofloxacin'];
const STATINS_CYP3A4 = ['simvastatin', 'atorvastatin'];
const AZOLES_MACROLIDES = ['clarithromycin', 'itraconazole', 'ketoconazole', 'erythromycin'];

const RULES: Rule[] = [
  // Bleeding
  { a: ['warfarin'], b: ['aspirin', ...NSAIDS], risk: 'An NSAID or aspirin with the anticoagulant causes GI mucosal injury and platelet inhibition, multiplying bleeding risk 3-5x; intracranial and gastrointestinal haemorrhage are the main dangers.' },
  { a: ['warfarin'], b: ['clopidogrel', 'ciprofloxacin', 'fluconazole', 'metronidazole', 'amiodarone', 'azithromycin'], risk: 'Warfarin clearance or effect is altered, raising the INR and the risk of serious bleeding. Monitor INR closely or choose another agent.' },
  { a: ['aspirin'], b: ['clopidogrel'], risk: 'Dual antiplatelet therapy is sometimes intended, but it raises major bleeding risk; confirm the indication and duration.' },
  { a: [...SSRIS], b: ['aspirin', ...NSAIDS], risk: 'SSRIs impair platelet function; with an NSAID or aspirin the risk of upper GI bleeding rises sharply.' },
  { a: ['clopidogrel'], b: ['omeprazole', 'esomeprazole'], risk: 'Omeprazole and esomeprazole reduce the antiplatelet bioactivation of clopidogrel via CYP2C19 inhibition, raising the risk of ischaemic events and stent thrombosis.' },
  // Serotonergic and CNS
  { a: ['tramadol'], b: [...SSRIS, 'amitriptyline', 'linezolid'], risk: 'Serotonergic synergy precipitates life-threatening serotonin syndrome and lowers the seizure threshold.' },
  { a: [...SSRIS], b: ['linezolid', 'tramadol'], risk: 'Serotonergic synergy precipitates life-threatening serotonin syndrome.' },
  { a: [...BENZOS], b: [...OPIOIDS], risk: 'Benzodiazepines with opioids cause profound sedation, respiratory depression, coma and death.' },
  { a: [...BENZOS, ...OPIOIDS], b: ['alcohol', 'gabapentin', 'pregabalin', 'phenobarbital'], risk: 'Additive central nervous system and respiratory depression.' },
  // Cardiovascular
  { a: ['sildenafil', 'tadalafil'], b: ['nitroglycerin', 'isosorbide mononitrate', 'isosorbide dinitrate'], risk: 'Fatal synergistic vasodilation and severe refractory hypotension (systolic drop over 50 mmHg).' },
  { a: ['digoxin'], b: ['amiodarone', 'verapamil', 'clarithromycin', 'quinidine'], risk: 'Serum digoxin concentration rises (P-glycoprotein inhibition), causing digitalis toxicity and lethal arrhythmias.' },
  { a: ['potassium'], b: ['spironolactone', 'eplerenone', ...ACE_ARB], risk: 'Potassium supplementation with a potassium-sparing diuretic, ACE inhibitor or ARB causes fatal hyperkalaemia and cardiac arrest.' },
  { a: ['spironolactone'], b: [...ACE_ARB], risk: 'Together they raise serum potassium; hyperkalaemia and cardiac arrest are possible, especially with kidney impairment.' },
  { a: [...ACE_ARB], b: [...NSAIDS], risk: 'An NSAID blunts the antihypertensive effect and, with an ACE inhibitor or ARB, raises the risk of acute kidney injury and hyperkalaemia.' },
  { a: ['metoprolol', 'atenolol', 'propranolol', 'bisoprolol'], b: ['verapamil', 'diltiazem'], risk: 'Beta-blocker with a non-dihydropyridine calcium-channel blocker causes severe bradycardia, AV block and heart failure.' },
  { a: ['amiodarone'], b: ['simvastatin', 'atorvastatin'], risk: 'Raised statin exposure increases the risk of myopathy and rhabdomyolysis.' },
  { a: [...QT.filter((d) => d !== 'amiodarone')], b: ['amiodarone'], risk: 'Two QT-prolonging drugs together risk torsades de pointes and sudden cardiac death.' },
  { a: ['azithromycin', 'clarithromycin', 'ondansetron'], b: ['haloperidol', 'levofloxacin', 'moxifloxacin'], risk: 'Two QT-prolonging drugs together risk torsades de pointes and sudden cardiac death.' },
  // Statin / enzyme inhibitors
  { a: STATINS_CYP3A4, b: AZOLES_MACROLIDES, risk: 'CYP3A4 inhibition raises statin levels several-fold, risking myopathy and rhabdomyolysis.' },
  // Antibiotics and others
  { a: ['ciprofloxacin'], b: ['theophylline', 'tizanidine'], risk: 'Ciprofloxacin inhibits CYP1A2 clearance, causing theophylline toxicity (seizures, tachycardia, arrhythmias) or profound hypotension with tizanidine.' },
  { a: [...FLUOROQUINOLONES], b: ['prednisolone', 'dexamethasone', 'hydrocortisone', ...NSAIDS], risk: 'Fluoroquinolones with a corticosteroid raise the risk of tendon rupture; with an NSAID they raise the risk of seizures.' },
  { a: ['methotrexate'], b: ['ibuprofen', 'aspirin', 'naproxen', 'diclofenac', 'trimethoprim', 'co-trimoxazole'], risk: 'Methotrexate clearance falls or it is displaced from protein binding, causing severe myelosuppression, pancytopenia and nephrotoxicity.' },
  { a: ['lithium'], b: [...NSAIDS, ...ACE_ARB, 'hydrochlorothiazide', 'furosemide'], risk: 'Lithium levels rise and can become toxic (tremor, confusion, seizures). Monitor serum lithium.' },
  { a: ['allopurinol'], b: ['azathioprine', 'mercaptopurine'], risk: 'Allopurinol blocks their breakdown, causing life-threatening bone-marrow suppression.' },
  { a: ['metformin'], b: ['iodinated contrast'], risk: 'Contrast-induced kidney injury with metformin raises the risk of lactic acidosis.' },
  { a: ['sitagliptin', 'vildagliptin', 'glimepiride', 'glibenclamide', 'gliclazide', 'insulin'], b: ['propranolol'], risk: 'A non-selective beta-blocker masks the warning signs of hypoglycaemia and can prolong it.' },
  { a: ['levothyroxine'], b: ['calcium', 'iron', 'ferrous', 'antacid'], risk: 'Calcium, iron and antacids bind levothyroxine in the gut and reduce its absorption; separate the doses by at least 4 hours.' },
  { a: ['doxycycline', 'tetracycline'], b: ['calcium', 'iron', 'ferrous', 'antacid'], risk: 'Divalent cations bind the antibiotic and cut its absorption sharply; separate the doses by 2-3 hours.' },
  { a: ['sildenafil', 'tadalafil'], b: ['doxazosin', 'tamsulosin', 'prazosin'], risk: 'Additive vasodilation can cause symptomatic hypotension and fainting.' },
  { a: ['phenytoin', 'carbamazepine'], b: ['warfarin', 'fluconazole', 'clarithromycin', 'erythromycin'], risk: 'Enzyme induction or inhibition changes the levels of one or both drugs, risking toxicity or loss of effect.' },
  { a: ['rifampicin'], b: ['warfarin', 'amlodipine', 'levothyroxine', 'prednisolone'], risk: 'Rifampicin induces liver enzymes and cuts the effect of the other drug; its dose usually needs to rise.' },
];

const key = (a: string, b: string) => [a, b].sort().join('|');

/** Every molecule of one group against every molecule of the other, once per pair (the same pair in two rules keeps the first). */
export function expandRules(rules: Rule[] = RULES): Interaction[] {
  const seen = new Set<string>();
  const out: Interaction[] = [];
  for (const r of rules) {
    for (const a of r.a) for (const b of r.b) {
      if (a === b || seen.has(key(a, b))) continue;
      seen.add(key(a, b));
      out.push({ drugA: a, drugB: b, riskDescription: r.risk });
    }
  }
  return out;
}

export const INTERACTION_LIST: Interaction[] = expandRules();
