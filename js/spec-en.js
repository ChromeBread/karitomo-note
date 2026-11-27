// English bodies of the 仕様メモ (Mechanics notes) for the GU mode; same keys, numbers and tables as js/spec.js.
// Names inside (skills, items, monsters) follow the Switch version; skill blocks and links come from spec.js.

const UNKNOWN = `<span class="pill">not confirmed</span>`;

export const TOPICS_EN = {
  sleep: {
    title: "Sleep bombing",
    body: ({ link }) => `
      <h2>Monsters that never sleep</h2>
      <p>Some monsters cannot be put to sleep at all. This app treats monsters whose sleep resistance in the game data is 0 (Lao-Shan Lung, Nakarkos, Ahtal-Neset and others) as "never sleeps" and shows no sleep bomb figures for them.</p>
      <p>Monsters that do sleep have their own resistance values (buildup for the first sleep, the increase each time, the maximum). Tough ones such as Deviants take many hits even for one sleep. The numbers are on each monster's sleep bomb page.</p>
      <h2>The first hit on a sleeping monster</h2>
      <table><tr><th>What hits</th><th>Multiplier</th></tr>
        <tr><td>Bombs, items</td><td>×3</td></tr>
        <tr><td>Melee and gunner attacks</td><td>×2</td></tr></table>
      <p class="muted">Only the hit that wakes it gets the multiplier.</p>
      <h2>Bad triggers that lose the ×3</h2>
      <ul>
        <li><b>The trigger hits the monster first</b>: if a Paintball, Normal shot, Throwing Knife or Small Barrel Bomb hits the monster itself, that small damage uses up the multiplier and the Barrel Bomb does ×1. Place bombs a little away from the body so only the blast hits.</li>
        <li><b>×3 is for the first bomb only</b>: however many Barrel Bomb L+ you set, only the first gets ×3 (150 for the others).</li>
      </ul>
      <h2>When waking it with your weapon is better</h2>
      <ul>
        <li><b>A strong single hit</b>: a Great Sword level 3 charge or a Charge Blade Super Amped Element Discharge often beats a Barrel Bomb L+ at ×3 (150×3 = 450) even at ×2.</li>
        <li><b>Small monsters</b>: Remobra, Conga and others can wake it with their attacks. Clear them first.</li>
      </ul>
      <p>${link("mons", "Sleep bomb damage by monster ›")}</p>`,
  },
  evade: {
    title: "Evasion",
    body: ({ skill }) => `
      <h2>Evasion invulnerability (i-frames)</h2>
      <p>The start of an evade has a moment where attacks cannot hit you (invulnerability). Slipping through attacks with it is called an i-frame dodge.</p>
      <p>The game runs at 30 frames a second; one frame is about 0.033 s.</p>
      <table><tr><th>Evade</th><th>Invulnerability</th></tr>
        <tr><td>No skill</td><td>0.2 s (6 frames)</td></tr>
        <tr><td>Evasion +1 (same for Evade Window)</td><td>0.33 s (10 frames)</td></tr>
        <tr><td>Evasion +2</td><td>0.4 s (12 frames)</td></tr>
        <tr><td>Evasion Down</td><td>0.1 s (3 frames)</td></tr></table>
      <p class="muted">Three separate sources, including guides for this series, give the same values (two of them for +2 and Down). Steps and demon dodges have invulnerability too. Bubble Dance also lengthens it, but by how much is not known.</p>
      <h3>Attacks you cannot evade without the skill</h3>
      <p>If an attack's hitbox lasts longer than your invulnerability, it hits whenever you evade. Without the skill (6 frames), attacks whose hitbox lasts 7 frames or more cannot be evaded. Evasion skills lengthen the window and let you evade more attacks.</p>
      <p class="muted">Even short hitboxes leave little room (e.g. a 5-frame hitbox without the skill allows only 1 frame ≈ 0.03 s of error).</p>
      <h2>Skills that affect evasion</h2>
      ${skill("回避性能")}${skill("回避術")}${skill("回避距離")}${skill("体術")}${skill("泡沫")}
      <h2>Evasion by style</h2>
      <p class="muted">Guild and Striker evades are the normal evade (table above). Frame counts per style were not found, so only how they work is written here.</p>
      <h3>Adept: Adept Evade</h3>
      <ul>
        <li><b>How it triggers</b>: being attacked during the evade. Timing it like a normal i-frame dodge works well.</li>
        <li><b>Window</b>: close to the old "Evasion +3" invulnerability, much longer than a normal evade (frames ${UNKNOWN}).</li>
        <li><b>Evasion skills do not help</b>: Evasion skills do not lengthen the Adept window (officially announced).</li>
        <li><b>After a success</b>: you leap the way you were facing, then dash a little toward the Circle Pad on landing. You are fully invulnerable from the leap to the landing. The dash can only be stopped by an attack or a Hunter Art.</li>
        <li><b>Hunter Art gauge</b>: a success fills it; stronger attacks dodged fill more.</li>
        <li><b>Weapons</b>: all but Lance and Gunlance (Charge Blade when sheathed and in axe mode). Lance, Gunlance and Charge Blade sword mode get Adept Guard instead, with a much shorter window than Adept Evade.</li>
        <li><b>Note</b>: climbing onto a ledge cancels the Adept Evade check.</li>
      </ul>
      <h3>Aerial: Aerial Evade</h3>
      <ul>
        <li>The evade becomes a forward vault. Touching a monster, an ally or a barrel during it turns into a vault jump.</li>
        <li><b>Two invulnerable moments</b>: a short one at the start of the roll and a longer one from the top of the vault to around the landing. The first is shorter than other styles' evades.</li>
        <li><b>Vault jump</b>: rising from it has an even longer invulnerability. Vaulting off a monster with your weapon drawn adds 10 to the Hunter Art gauge.</li>
        <li><b>Lance, Gunlance (Aerial Step)</b>: with Evasion +2 the first invulnerability lasts until the point where the vault starts (the top).</li>
        <li>Seconds / frames ${UNKNOWN}</li>
      </ul>
      <h3>Valor: Valor Sheathe</h3>
      <ul>
        <li>Taking a hit while in the sheathing state triggers a "Valor Sheathe": you step back with invulnerability and sheathe.</li>
        <li><b>Damage taken</b>: 30% for blademasters, 15% for gunners. Afterwards the attack's hitbox stops hitting you, like after a guard.</li>
        <li>Valor sheathes more slowly than other styles.</li>
        <li>Invulnerability seconds / frames ${UNKNOWN}</li>
      </ul>
      <h3>Alchemy</h3>
      <ul>
        <li>While making an Alchemy item, the forward roll (B) cancels it until the item is decided; after that it cannot be cancelled.</li>
      </ul>`,
  },
  fixed: {
    title: "Fixed damage",
    body: ({ link }) => `
      <p>Damage of a set amount whatever the hitzone. Weapon attack and weak spots do not matter. <b>The quest's defense rate does apply</b> (the real damage is the value times the "defense rate" on the quest page). Bombs look fiery but have no element.</p>
      <h2>Bombs</h2>
      <table><tr><th>Bomb</th><th>Damage</th><th>Bombardier</th></tr>
        <tr><td>Barrel Bomb S</td><td>20</td><td>26</td></tr>
        <tr><td>Bounce Bomb</td><td>20</td><td>26</td></tr>
        <tr><td>Bounce Bomb+</td><td>30</td><td>39</td></tr>
        <tr><td>Barrel Bomb L</td><td>80</td><td>104</td></tr>
        <tr><td>Barrel Bomb L+, EZ Barrel Bomb L</td><td>150</td><td>195</td></tr>
        <tr><td>Anti-dragon Bomb</td><td>400</td><td>520</td></tr></table>
      <p class="muted">Bombardier makes bombs ×1.3. The first hit on a sleeping monster is ×3 for bombs (about ×4 with Bombardier) and ×2 for weapon attacks.</p>
      <h2>Status</h2>
      <ul>
        <li><b>Blast</b>: the damage of a blast explosion is set per monster. It is in the "Damage" column (Blast) of "Status resistance" on the monster page.</li>
        <li><b>Poison</b>: the total poison damage is also set per monster: "Damage" (Poison) in the same table is the total, "Time" how long it lasts.</li>
      </ul>
      <h2>Bowguns</h2>
      <table><tr><th>Ammo / art</th><th>Fixed damage</th><th>Also</th></tr>
        <tr><td>Crag S Lv1 / 2 / 3 explosion</td><td>25 / 30 / 40</td><td>Fire 30 / 45 / 60, stun 25 / 30 / 40</td></tr>
        <tr><td>Clust S Lv1 / 2 / 3 bomblets</td><td>25 each (3 / 4 / 5)</td><td>Fire 2 (per bomblet)</td></tr>
        <tr><td>Cannon S Lv1 / 2 explosion (internal)</td><td>30 / 40</td><td>stun 10 / 15</td></tr>
        <tr><td>Clust Crag S (internal)</td><td>30 ×3</td><td>Fire 30, stun 25 (each)</td></tr>
        <tr><td>Bullet Geyser (Light Bowgun art) I / II / III</td><td>20×1 / 13×3 / 10×6</td><td>Fire 10 on the mine</td></tr></table>
      <p class="muted">The shot itself (raw) depends on hitzones; only the explosion is fixed. Artillery raises the Crag explosion (from the skill text). Which bowgun fires which ammo: ${link("find/ammo", "Find by bowgun ammo")}.</p>
      <h2>Gunlance shelling</h2>
      <table><tr><th>Shell type</th><th>Lv1</th><th>Lv2</th><th>Lv3</th><th>Lv4</th><th>Lv5</th><th>Full Burst</th><th>Charged</th></tr>
        <tr><td>Normal</td><td>10</td><td>14</td><td>18</td><td>21</td><td>24</td><td>×1.2</td><td>×1.2</td></tr>
        <tr><td>Long</td><td>15</td><td>21</td><td>28</td><td>32</td><td>36</td><td>×1.0</td><td>×1.2</td></tr>
        <tr><td>Wide</td><td>20</td><td>30</td><td>40</td><td>44</td><td>48</td><td>×0.9</td><td>×1.45</td></tr></table>
      <table><tr><th>Wyvern's Fire</th><th>Lv1</th><th>Lv2</th><th>Lv3</th><th>Lv4</th><th>Lv5</th></tr>
        <tr><td>Normal, Wide</td><td>30</td><td>35</td><td>40</td><td>45</td><td>50</td></tr>
        <tr><td>Long</td><td>36</td><td>42</td><td>48</td><td>54</td><td>60</td></tr></table>
      <ul>
        <li>Artillery Novice ×1.1, Artillery Expert ×1.2. Felyne Bombardier (meal) ×1.1; combined it is ×1.21 with Novice, and with Expert <b>capped at ×1.3</b> instead of ×1.32.</li>
        <li>Order: base × Artillery (drop decimals) → × Full Burst etc. (drop decimals) → × defense rate (drop decimals).</li>
        <li>Valor shelling depends on which shot of the chain it is (1st–6th: ×1.0, 1.2, 1.5, 2.0, 2.6, 2.6). Valor Full Burst applies a multiplier to every shell by how many are loaded (1–6: ×0.8, 0.9, 1.0, 1.4, 1.5, 1.6 — a jump at 4).</li>
        <li>Shells also have a fire part (Normal Lv1–5: 4–8, Long: 9–18, Wide: 6–12, Wyvern's Fire: 10–14) that depends on the fire hitzone. How that part is calculated is not confirmed yet.</li>
      </ul>
      <h2>Ballistae, cannons and more</h2>
      <table><tr><th>What</th><th>Damage</th></tr>
        <tr><td>Ballista shot</td><td>40 ×2 hits (80)</td></tr>
        <tr><td>Fortress ballista shot</td><td>twice a ballista shot</td></tr>
        <tr><td>Cannonball</td><td>170 (mobile cannons: as many as loaded, up to 10)</td></tr>
        <tr><td>Dragonator</td><td>255 × up to 4 hits (2 per spike, 1020 in all)</td></tr>
        <tr><td>Wyvern Cannon</td><td>2500</td></tr></table>
      <p class="muted">Ballistae and cannons go up with Artillery (Novice ×1.1, Expert ×1.2). The Dragonator does not. The cap with Felyne Bombardier is ×1.3 in some sources and ×1.4 in others; not settled yet.</p>
      <h2>Blast</h2>
      <ul>
        <li>Status on blademaster weapons (and bows) builds up on only 1 of 3 hits.</li>
        <li>Blast buildup does not decay over time. An explosion resets it to 0; the overflow is not carried over.</li>
        <li>Each explosion raises the amount needed for the next (said to rise about twice as fast in G Rank). Explosion damage is fixed per monster, and <b>the defense rate does not apply</b>.</li>
      </ul>
      <p><a class="btn primary" href="#spec/dmg">Damage calculator (shelling, fixed damage, blast) ›</a></p>
      <p>${link("mons", "Sleep bomb damage by monster ›")}</p>`,
  },
  versions: {
    title: "GU and XX",
    body: ({ D, esc }) => {
      const jp = D.jpQuests || [];
      return `
      <p>This app switches between the Japanese version (XX) and the English version (GU) under Settings → Language. The data is the same; names and text change.</p>
      <h2>What is the same</h2>
      <ul>
        <li>GU and XX players can join the same Hub and play together (checked by the user).</li>
        <li>Monsters, weapons, armor, skills and quests are almost the same. Differences found will be added here.</li>
      </ul>
      <h2>Names</h2>
      <ul>
        <li>GU shows items, monsters, skills, armor, weapons, maps and quests with their English names, with the Japanese official name in small type above (where XX shows the reading).</li>
        <li>Search works with English names, and with Japanese or kana too.</li>
        <li>Examples: 集会所 → Hub, 村 → Village, ニャンター → Prowler, ★1 → 1★, G級 → G Rank.</li>
      </ul>
      <h2>Event quests given out only in Japan</h2>
      <p>Some download quests, such as collaborations, were only given out in Japan (checked by the user). GU leaves out these quests and the gear made only from their rewards. XX shows everything.</p>
      ${jp.length ? `<p class="muted">Japan-only event quests missing from the GU quest list (${jp.length}):</p><ul lang="ja">${jp.map((q) => `<li>${esc(q.name)}</li>`).join("")}</ul>` : ""}`;
    },
  },
  bowgun: {
    title: "Bowgun reload and recoil",
    body: ({ skill, link }) => `
      <p>Reload, recoil and deviation per bowgun and clip size per ammo are in the "Ammo" table of each weapon page. To search the other way: ${link("find/ammo", "Find by bowgun ammo")}.</p>
      <h2>Reload</h2>
      <p>The game data shows bowgun reload in steps: <b>Very Fast, Fast, Normal, Slow, Very Slow</b>. Faster means a shorter loading motion.</p>
      ${skill("装填速度")}
      <p class="muted">How many steps the Reload Speed skill shifts and the seconds per step are ${UNKNOWN}.</p>
      <ul>
        <li><b>Full Reload (Light Bowgun art)</b>: speed depends only on the art's level, not the bowgun's reload. I skips Rapid Fire ammo and is slow, II is about Normal–Slow, III reloads Rapid Fire ammo too.</li>
        <li><b>Accel Shower (Heavy Bowgun art)</b>: while active, every ammo reloads with the fast motion and recoil is fixed small.</li>
        <li><b>Valor Reload</b>: the same speed whatever the ammo.</li>
        <li>The claim that "Alchemy style lowers reload by one step" is said to be wrong.</li>
      </ul>
      <h2>Recoil</h2>
      <p>Recoil is how much your body stops after a shot. The game data has <b>Smallest, Small, Medium, Large</b>. Larger recoil means a longer pause after shooting.</p>
      ${skill("反動")}
      <ul>
        <li><b>Recoil Down</b>: shifts recoil lighter (+) or heavier (−) by the skill's number.</li>
        <li><b>Rapid Fire</b>: Recoil Down does not affect Rapid Fire recoil. It is set per weapon and shown in the weapon page's "Rapid Fire" column like "2/100% Large" (shots per fire / power per shot, recoil).</li>
        <li><b>Valor style (Light Bowgun)</b>: outside the Valor state recoil is one step heavier; a Valor Reload makes it one step lighter for a while. A "Medium" bowgun is "Large" normally, "Medium" in the Valor state or after a Valor Reload, and "Small" with both.</li>
        <li><b>Heavy Bowgun jump shots</b>: they ignore recoil, so Recoil Down is not needed.</li>
      </ul>
      <h2>Deviation and Crouching Fire</h2>
      ${skill("精密射撃")}
      <ul>
        <li><b>Crouching Fire (Heavy Bowgun)</b>: fire matching ammo crouched without reloading. Which ammo and how many shots are in the weapon page's "Crouching Fire" column. Usable in Guild, Aerial and Adept; Valor turns it into the stronger Voltage Shot.</li>
      </ul>
      <p class="muted">Detailed recoil and reload figures (seconds, frames) and which recoil step lets each ammo fire without stopping are not confirmed yet.</p>`,
  },
  stack: {
    title: "Buff stacking (attack / defense)",
    body: () => `
      <p><a class="btn primary" href="#spec/calc">Try the buff calculator ›</a></p>
      <h2>How attack buffs stack (XX)</h2>
      <p>Attack buffs come in "groups". <b>Different groups all stack</b>; within a group only one works. "+N" is added to the true raw (shown attack divided by the weapon class multiplier).</p>
      <ul class="grouplist">
        <li><b>Charm</b>: Powercharm +6<br><span class="muted">works as long as you carry it</span></li>
        <li><b>Talon</b>: Powertalon +9<br><span class="muted">separate from the charm, so they stack (+15)</span></li>
        <li><b>Drugs, meals</b>: Demondrug +5, Mega Demondrug +7, meal Attack Up (S) +3, (M) +5, (L) +7<br><span class="muted">the higher one works (a weaker one used later does not overwrite it). <b>Since the previous game, Demondrug and meals stack</b></span></li>
        <li><b>Seeds, flutes, ammo</b>: Might Seed +10 (3 min), Might Pill +25 (20 s), Exciteshroom +10 (3 min), Demon Flute +10 (3 min), Demon S / Demon Armor S +10 (90 s, sharpness ×1.1), Demon Aff S +15, affinity +10% (90 s), the Palico dance meal skill +15 (30 s)<br><span class="muted"><b>the one used last works</b>: a pill after a seed gives the pill's effect</span></li>
        <li><b>Palico</b>: Felyne Booster +3 (first 10 min, or until you sleep at camp)</li>
        <li><b>Attack skill</b>: Attack Up (S) +10, (M) +15, (L) +20 (Honed Blade also +20)</li>
        <li><b>Heroics</b>: Adrenaline +2 ×1.3, Felyne Heroics ×1.35</li>
        <li><b>Hunting Horn songs</b>: Attack Up (S) ×1.1 (encore ×1.15), (L) ×1.15 (encore ×1.2)</li>
        <li><b>Fortify</b>: one faint ×1.1, two ×1.2</li>
        <li><b>Challenger, Peak Performance, Latent Power</b>: Challenger +1 +10 / affinity +10%, Challenger +2 +20 / affinity +15%, Peak Performance (and the Brawler skill) +20 at full health, Latent Power +1 affinity +30%, +2 affinity +50%<br><span class="muted">priority: Challenger > Peak Performance > Latent Power</span></li>
        <li><b>Polar / Tropic Hunter</b>: Polar: +15 in cold areas (+5 after a Cool Drink), Tropic: +15 in hot areas</li>
        <li><b>Bludgeoner</b>: sharpness green ×1.1, yellow ×1.15, orange / red ×1.2</li>
        <li><b>Resentment / Resuscitate</b>: Resuscitate +20 while under a status; Resentment +20 while you have red health</li>
        <li><b>Dragon Instinct</b>: ×1.1 while active</li></ul>
      <p class="muted">The attack table is based on information compiled for XX. Nitroshroom (+5) raised attack in tests of the previous game, but its group is not known.</p>
      <h2>Defense buffs</h2>
      <p class="muted">Defense figures come from tests of the previous game (X). They are thought to be the same in XX but were not checked in XX. Items of the same family (Armorskin and Mega Armorskin, Adamant Seed and Pill) do not stack.</p>
      <div class="table-wrap"><table><tr><th>What</th><th>Raise</th><th>Duration</th><th>Note</th></tr>
        <tr><td>Armorcharm</td><td>+6</td><td>always</td><td>stacks with Armortalon</td></tr>
        <tr><td>Armortalon</td><td>+9</td><td>always</td><td>stacks with Armorcharm</td></tr>
        <tr><td>Armorskin</td><td>+15</td><td>until you faint</td><td>does not stack with Mega</td></tr>
        <tr><td>Mega Armorskin</td><td>+25</td><td>until you faint</td><td>does not stack with Armorskin</td></tr>
        <tr><td>Parashroom, Bindshroom</td><td>+15</td><td>until you faint</td><td></td></tr>
        <tr><td>Armor Flute</td><td>+15</td><td>180 s</td><td>no flinching (super armor)</td></tr>
        <tr><td>Armor S (bowgun)</td><td>+15</td><td>90 s</td><td></td></tr>
        <tr><td>Super Armor S (bowgun)</td><td>+25</td><td>90 s</td><td>no flinching</td></tr>
        <tr><td>Adamant Seed</td><td>+40</td><td>180 s</td><td>does not stack with the Pill</td></tr>
        <tr><td>Adamant Pill</td><td>+50</td><td>20 s</td><td>no flinching</td></tr>
        <tr><td>Hunting Horn Defense Up (S)</td><td>×1.1 (encore ×1.15)</td><td>120 s (150 s with Horn Maestro)</td><td></td></tr>
        <tr><td>Hunting Horn Defense Up (L)</td><td>×1.15 (encore ×1.2)</td><td>90 s (120 s with Horn Maestro)</td><td></td></tr></table></div>
      <h2>Damage reduction (Divine Blessing)</h2>
      <ul class="grouplist">
        <li><b>Divine Blessing (skill)</b>: 1/4 chance to take 30% less damage. <span class="muted">Demonic Blessing instead takes 1.3× damage 1/4 of the time</span></li>
        <li><b>Felyne Defender (meal)</b>: (Lo) 1/8, (Hi) 1/4 chance of 30% less damage. With both, only (Hi) counts</li>
        <li><b>Divine Blessing and Felyne Defender stack</b>: the blessing rolls first and the meal rolls only if it misses. Together about 44% (1 − 3/4 × 3/4) of hits are reduced by 30%.</li>
        <li><b>Hunting Horn Divine Protection</b>: 1/2 chance of 30% less damage. It does not stack with Divine Blessing or Felyne Defender; while the song is active only it works.</li>
      </ul>
      <p class="muted">Blessing figures come from earlier games. They were not checked in XX.</p>
      <h2>Not confirmed yet</h2>
      <ul>
        <li>How much Demon Powder and Hardshell Powder raise and whether they stack with seeds ${UNKNOWN}</li>
        <li>How Hunter Arts (Beast Mode, demon modes and so on) and Palico support moves stack ${UNKNOWN}</li>
      </ul>`,
  },
};
