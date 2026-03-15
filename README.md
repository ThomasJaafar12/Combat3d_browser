# Combat3d_browser
combat_proto

General plan, system by system

    Combat foundation

Build the combat around:

leader-controlled real-time third-person movement

server-authoritative damage, cooldowns, resources, status, death/downed

client-side prediction only for responsiveness

no “full action combo” design yet; simple attacks are dependable filler

This system is the backbone. Every later layer should call into a common combat rules module:

AttackDefinition

SpellDefinition

EffectDefinition

UnitCombatState

TargetingRequest

CastResolution

Do not hardcode “player spell 1/2/3” into logic. Make spells data-defined and equipped from a spellbook.

    Unit / faction architecture

You need one shared unit model for:

player leader

companions

enemies

Each unit should have:

faction

archetype

weapon type

stats

spell loadout

AI controller or player controller

order group id

downed/dead state

threat / current target

behavior profile reference

That avoids building separate logic stacks for companions and enemies.

    Player combat loop

Player loop in V0:

move with WASD

basic attack with main weapon

cast 3 slotted spells via hotkeys

click valid target or fire skillshot

issue party/group order

revive downed companion when in range

choose level-up reward after wave

This is enough to feel like “Bannerlord command + compact spellbar + meaningful basics.”

    Spell system

For V0, design the spell system around a small schema:

id

name

resource cost

cooldown

cast time

range

targeting mode

AoE shape

projectile or instant

effects[]

VFX/SFX refs

AI tags

Targeting modes for V0:

self

ally unit

enemy unit

ground point

skillshot line/cone/projectile

Effects for V0:

damage

heal

shield

slow

taunt

knockback light

mark/focus

revive not needed as a spell at first; keep revive as contextual interaction

That gives enough Dofus flavor without exploding complexity.

    Basic attack system

Basic attacks should be first-class, not fallback junk.

Design intent:

no cost

short cooldown / attack speed gated

weapon-defined range and cadence

best reliable output when spell resources are constrained

used by player and AI

can trigger simple tags like “build pressure,” “finish marked target,” or “maintain threat”

For V0, do not add combo trees. Just make basics readable, responsive, and tactically relevant.

    Orders system

Orders are one of your differentiators. Keep V0 orders simple but systemic:

Follow me

Hold position

Attack my target

Defend area

Focus weakest

Retreat

Orders should work on:

all companions

selected custom group

archetype group

Implementation rule: Orders should modify AI goal selection, not directly puppet movement every frame. That will scale better later.

    Companion AI / rule editor

For V0, ship a small rule editor, not a true full behavior tree.

Good V0 structure:

behavior stance: aggressive / defensive / support

priority rules:

if ally HP < X, cast heal

if target in range, cast opener

if marked target exists, focus marked target

if low HP, retreat

rotation chain:

cast spell A

then spell B

otherwise basic attack

order override layer on top

Internally, model this as:

conditions

selectors

actions

priority evaluation tick

It should look like a mini behavior tree to the user, but underneath it can be a much simpler priority graph.

    Enemy AI

Use the same spell framework and mostly the same AI framework as companions.

Enemy archetypes:

melee chaser: gap close, basic pressure

ranged caster: kite + cast + AoE punish

tank/disruptor: soak, taunt, zone denial

That symmetry is important because later it lets you turn enemy skills into recruitable companion skills or player spell options.

    Roguelike progression layer

Keep the meta layer tiny in V0:

clear one wave

get XP

level up

choose one reward from three

rewards affect:

stat bump

upgrade one equipped spell

unlock one temporary passive

recruit one extra companion option if you want a little spice

Do not build a full run system yet. Just one post-wave reward screen.

    Downed / revive system

This is worth keeping in V0 because it reinforces party leadership.

Simple rules:

companions enter downed state at 0 HP

player can revive in range over time

enemies die outright

player death = defeat

optional timer before companion bleeds out

This gives drama without too much complexity.

    Map / encounter design

The outdoor map should be small, readable, and asymmetric:

central open engagement area

side obstacle clusters

one elevated or narrow pressure lane if easy

clear spawn point for enemies

clear player spawn/recruit area

Do not overbuild the environment. Its job is to test target selection, movement obstruction, spell shapes, and order usage.

    Technical architecture

Because you want future expansion, the repo should evolve toward:

data-driven content

shared combat definitions

thin rendering layer

server-owned truth

AI as a consumer of the same targeting/effect API as players

High-level modules:

shared/definitions — spells, weapons, archetypes, rewards

server/combat — authority, validation, resolution

server/ai — orders, priorities, target selection

client/presentation — VFX, UI, selection, camera

client/input — move, target, cast, order

client/debug — overlays, cooldowns, AI state, nav markers
