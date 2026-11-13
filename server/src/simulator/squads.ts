/**
 * Demo playing XIs used by the match simulator (batting order; the last six bowl).
 * Based on IPL 2025 squads — this is simulation data only, edit freely.
 * The team's current captain (from the database) is always included, so a captain
 * change made by an admin shows up in the next simulated match.
 */
export const SQUADS: Record<string, string[]> = {
  CSK: ['Ruturaj Gaikwad', 'Devon Conway', 'Rachin Ravindra', 'Shivam Dube', 'MS Dhoni', 'Ravindra Jadeja', 'Sam Curran', 'Noor Ahmad', 'Ravichandran Ashwin', 'Khaleel Ahmed', 'Matheesha Pathirana'],
  MI: ['Rohit Sharma', 'Ryan Rickelton', 'Suryakumar Yadav', 'Tilak Varma', 'Hardik Pandya', 'Naman Dhir', 'Will Jacks', 'Mitchell Santner', 'Deepak Chahar', 'Trent Boult', 'Jasprit Bumrah'],
  RCB: ['Virat Kohli', 'Phil Salt', 'Rajat Patidar', 'Liam Livingstone', 'Jitesh Sharma', 'Tim David', 'Krunal Pandya', 'Bhuvneshwar Kumar', 'Josh Hazlewood', 'Yash Dayal', 'Suyash Sharma'],
  KKR: ['Quinton de Kock', 'Sunil Narine', 'Ajinkya Rahane', 'Venkatesh Iyer', 'Rinku Singh', 'Andre Russell', 'Ramandeep Singh', 'Harshit Rana', 'Vaibhav Arora', 'Varun Chakaravarthy', 'Spencer Johnson'],
  SRH: ['Travis Head', 'Abhishek Sharma', 'Ishan Kishan', 'Heinrich Klaasen', 'Nitish Kumar Reddy', 'Aniket Verma', 'Pat Cummins', 'Harshal Patel', 'Mohammed Shami', 'Zeeshan Ansari', 'Kamindu Mendis'],
  RR: ['Yashasvi Jaiswal', 'Sanju Samson', 'Nitish Rana', 'Riyan Parag', 'Dhruv Jurel', 'Shimron Hetmyer', 'Wanindu Hasaranga', 'Jofra Archer', 'Maheesh Theekshana', 'Sandeep Sharma', 'Tushar Deshpande'],
  DC: ['Jake Fraser-McGurk', 'Faf du Plessis', 'Abishek Porel', 'KL Rahul', 'Tristan Stubbs', 'Axar Patel', 'Ashutosh Sharma', 'Vipraj Nigam', 'Mitchell Starc', 'Kuldeep Yadav', 'Mukesh Kumar'],
  PBKS: ['Prabhsimran Singh', 'Priyansh Arya', 'Shreyas Iyer', 'Josh Inglis', 'Nehal Wadhera', 'Shashank Singh', 'Marcus Stoinis', 'Marco Jansen', 'Arshdeep Singh', 'Yuzvendra Chahal', 'Harpreet Brar'],
  LSG: ['Mitchell Marsh', 'Aiden Markram', 'Nicholas Pooran', 'Rishabh Pant', 'Ayush Badoni', 'David Miller', 'Abdul Samad', 'Shardul Thakur', 'Ravi Bishnoi', 'Avesh Khan', 'Digvesh Rathi'],
  GT: ['Shubman Gill', 'Sai Sudharsan', 'Jos Buttler', 'Shahrukh Khan', 'Rahul Tewatia', 'Washington Sundar', 'Rashid Khan', 'Sai Kishore', 'Mohammed Siraj', 'Prasidh Krishna', 'Kagiso Rabada'],
};

/** Playing XI for a team; the current captain replaces a non-bowler slot if not already in it. */
export function squadFor(short: string, captain: string): string[] {
  const base = SQUADS[short] ?? Array.from({ length: 11 }, (_, i) => `${short} Player ${i + 1}`);
  if (base.includes(captain)) return [...base];
  const squad = [...base];
  squad[3] = captain; // middle order
  return squad;
}
