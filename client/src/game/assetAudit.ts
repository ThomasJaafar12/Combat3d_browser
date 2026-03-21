export const assetAudit = {
  characters: {
    leader: "assets/game/characters/leader/char_human_swordshield_01.fbx",
    companionPaladin: "assets/game/characters/leader_paladin/paladin.fbx",
    companionArcher: "assets/game/characters/companions/char_human_archer_01.fbx",
    enemyAxe: "assets/game/characters/enemies/char_human_axe_01.fbx",
  },
  equipment: {
    leaderSword: "assets/game/weapons/melee/weapon_sword_short_01.gltf",
    leaderShield: "assets/game/weapons/melee/weapon_shield_round_01.gltf",
  },
  weaponVisuals: {
    rangerBow: "assets/game/weapons/ranged/weapon_bow_long_string_01.gltf",
  },
  environment: [
    "assets/game/environment/arena_outdoor/ground/env_ground_arena_brick_01.gltf",
    "assets/game/environment/arena_outdoor/obstacles/env_obstacle_crate_01.gltf",
    "assets/game/environment/arena_outdoor/obstacles/env_obstacle_wall_stone_01.gltf",
    "assets/game/environment/arena_outdoor/obstacles/env_obstacle_fence_wood_01.gltf",
    "assets/game/environment/arena_outdoor/props/env_prop_archway_01.gltf",
  ],
  ui: [
    "assets/game/ui/frames/ui_frame_order_button_01.png",
    "assets/game/ui/frames/ui_bar_back_01.png",
    "assets/game/ui/frames/ui_bar_fill_01.png",
    "assets/game/ui/markers/ui_marker_target_enemy_01.png",
  ],
  audio: [
    "assets/game/audio/impacts/audio_hit_blade_01.ogg",
    "assets/game/audio/spells/audio_spell_arcane_impact_01.ogg",
    "assets/game/audio/ui/audio_ui_levelup_01.ogg",
  ],
} as const;
