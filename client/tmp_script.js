import fs from 'fs';
const content = fs.readFileSync('C:/Users/Thomas/Desktop/0.biblio/projet code/Combat3d_browser/assets/game/characters/leader/anim_leader_swordshield_walk_left_01.fbx', 'utf8');
const matches = content.match(/[a-zA-Z0-9_]+/g) || [];
const unique = [...new Set(matches)];
const bones = unique.filter(x => x.toLowerCase().includes('hips') || x.toLowerCase().includes('root') || x.toLowerCase().includes('pelvis') || x.toLowerCase().includes('armature') || x.toLowerCase().includes('spine'));
console.log(bones.join(', '));
