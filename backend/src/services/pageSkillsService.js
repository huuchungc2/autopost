import { query } from '../db.js';

const SKILL_SELECT = `s.id, s.name, s.description, s.skill_type, s.system_prompt,
            LEFT(s.system_prompt, 200) AS prompt_preview,
            CHAR_LENGTH(s.system_prompt) AS prompt_length`;

function normalizeSkillType(type) {
  if (['text', 'image', 'video'].includes(type)) return type;
  return 'text';
}

function splitSkillsByType(skills) {
  const textSkills = skills.filter((s) => normalizeSkillType(s.skill_type) === 'text');
  const imageSkills = skills.filter((s) => normalizeSkillType(s.skill_type) === 'image');
  const videoSkills = skills.filter((s) => normalizeSkillType(s.skill_type) === 'video');
  return { textSkills, imageSkills, videoSkills };
}

function combineSkills(skills, label) {
  if (!skills?.length) return '';
  if (skills.length === 1) return skills[0].system_prompt;
  return skills
    .map((s, i) => `[${label} ${i + 1}: ${s.name}]\n${s.system_prompt}`)
    .join('\n\n');
}

async function loadPageSkills(pageId) {
  try {
    return await query(
      `SELECT ${SKILL_SELECT}, ps.sort_order
       FROM page_skills ps
       JOIN skills s ON s.id = ps.skill_id
       WHERE ps.page_id = ?
       ORDER BY ps.sort_order ASC, s.name ASC`,
      [pageId]
    );
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') {
      return query(
        `SELECT s.id, s.name, s.description, s.system_prompt,
                LEFT(s.system_prompt, 200) AS prompt_preview,
                CHAR_LENGTH(s.system_prompt) AS prompt_length,
                ps.sort_order
         FROM page_skills ps
         JOIN skills s ON s.id = ps.skill_id
         WHERE ps.page_id = ?
         ORDER BY ps.sort_order ASC, s.name ASC`,
        [pageId]
      ).then((rows) => rows.map((r) => ({ ...r, skill_type: 'text' })));
    }
    throw error;
  }
}

export async function getPageSkills(pageId) {
  return loadPageSkills(pageId);
}

export async function getSkillsGroupedByPageIds(pageIds) {
  if (!pageIds.length) return {};
  const placeholders = pageIds.map(() => '?').join(',');
  let rows;
  try {
    rows = await query(
      `SELECT ps.page_id, ${SKILL_SELECT}, ps.sort_order
       FROM page_skills ps
       JOIN skills s ON s.id = ps.skill_id
       WHERE ps.page_id IN (${placeholders})
       ORDER BY ps.sort_order ASC, s.name ASC`,
      pageIds
    );
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    rows = await query(
      `SELECT ps.page_id, s.id, s.name, s.description, s.system_prompt,
              LEFT(s.system_prompt, 200) AS prompt_preview,
              CHAR_LENGTH(s.system_prompt) AS prompt_length,
              ps.sort_order
       FROM page_skills ps
       JOIN skills s ON s.id = ps.skill_id
       WHERE ps.page_id IN (${placeholders})
       ORDER BY ps.sort_order ASC, s.name ASC`,
      pageIds
    );
    rows = rows.map((r) => ({ ...r, skill_type: 'text' }));
  }

  return rows.reduce((acc, row) => {
    const { page_id, ...skill } = row;
    if (!acc[page_id]) acc[page_id] = [];
    acc[page_id].push(skill);
    return acc;
  }, {});
}

export async function syncPageSkills(pageId, skillIds) {
  const ids = [...new Set((skillIds || []).map((id) => Number(id)).filter(Boolean))];

  await query('DELETE FROM page_skills WHERE page_id = ?', [pageId]);

  for (let i = 0; i < ids.length; i += 1) {
    await query(
      'INSERT INTO page_skills (page_id, skill_id, sort_order) VALUES (?, ?, ?)',
      [pageId, ids[i], i]
    );
  }

  const textSkillRows = ids.length
    ? await query(
      `SELECT id FROM skills WHERE id IN (${ids.map(() => '?').join(',')})
       AND (skill_type = 'text' OR skill_type IS NULL) LIMIT 1`,
      ids
    ).catch(() => [{ id: ids[0] }])
    : [];

  await query('UPDATE fb_pages SET skill_id = ? WHERE id = ?', [textSkillRows[0]?.id || ids[0] || null, pageId]);
}

export async function assertSkillLinkedToPage(pageId, skillId) {
  if (!skillId) return null;
  const rows = await query(
    `SELECT s.id, s.name, s.system_prompt, s.skill_type
     FROM page_skills ps
     JOIN skills s ON s.id = ps.skill_id
     WHERE ps.page_id = ? AND ps.skill_id = ?`,
    [pageId, skillId]
  );
  if (!rows.length) {
    const error = new Error('Skill chưa được gắn với fanpage này');
    error.status = 400;
    throw error;
  }
  return rows[0];
}

export async function resolveGenerationPrompts(pageId, { textSkillId = null, mediaType = null } = {}) {
  let skills = await loadPageSkills(pageId);

  if (!skills.length) {
    const legacy = await query(
      `SELECT s.id, s.name, s.system_prompt, s.skill_type
       FROM fb_pages fp
       LEFT JOIN skills s ON s.id = fp.skill_id
       WHERE fp.id = ? AND fp.skill_id IS NOT NULL`,
      [pageId]
    ).catch(async () => {
      const rows = await query(
        `SELECT s.id, s.name, s.system_prompt
         FROM fb_pages fp
         LEFT JOIN skills s ON s.id = fp.skill_id
         WHERE fp.id = ? AND fp.skill_id IS NOT NULL`,
        [pageId]
      );
      return rows.map((r) => ({ ...r, skill_type: 'text' }));
    });

    if (legacy[0]?.id) {
      skills = [{ ...legacy[0], skill_type: legacy[0].skill_type || 'text', sort_order: 0 }];
    }
  }

  let { textSkills, imageSkills, videoSkills } = splitSkillsByType(skills);

  if (textSkillId) {
    const picked = textSkills.find((s) => s.id === Number(textSkillId))
      || skills.find((s) => s.id === Number(textSkillId) && normalizeSkillType(s.skill_type) === 'text');
    if (!picked) {
      const error = new Error('Skill viết bài chưa được gắn với fanpage này');
      error.status = 400;
      throw error;
    }
    textSkills = [picked];
  }

  const textSystemPrompt = combineSkills(textSkills, 'Skill viết');
  const imageSystemPrompt = combineSkills(imageSkills, 'Skill ảnh');
  const videoSystemPrompt = combineSkills(videoSkills, 'Skill video');

  let resolvedMediaType = mediaType;
  if (!resolvedMediaType) {
    if (imageSkills.length) resolvedMediaType = 'image';
    else if (videoSkills.length) resolvedMediaType = 'video';
    else resolvedMediaType = 'image';
  }

  return {
    skills,
    textSkills,
    imageSkills,
    videoSkills,
    textSystemPrompt,
    imageSystemPrompt,
    videoSystemPrompt,
    mediaType: resolvedMediaType,
    activeTextSkill: textSkills[0] || null,
  };
}

/** @deprecated dùng resolveGenerationPrompts */
export async function resolveSkillPrompt(pageId, skillId = null) {
  const resolved = await resolveGenerationPrompts(pageId, { textSkillId: skillId });
  return {
    skills: resolved.skills,
    skillPrompt: resolved.textSystemPrompt,
    activeSkill: resolved.activeTextSkill,
  };
}

export async function enrichPagesWithSkills(pages) {
  if (!pages.length) return pages;
  const grouped = await getSkillsGroupedByPageIds(pages.map((p) => p.id));
  return pages.map((page) => {
    const skills = grouped[page.id] || [];
    const textSkills = skills.filter((s) => normalizeSkillType(s.skill_type) === 'text');
    const imageSkills = skills.filter((s) => normalizeSkillType(s.skill_type) === 'image');
    const videoSkills = skills.filter((s) => normalizeSkillType(s.skill_type) === 'video');
    const primary = textSkills[0] || skills[0];
    return {
      ...page,
      skills,
      text_skills: textSkills,
      image_skills: imageSkills,
      video_skills: videoSkills,
      skill_ids: skills.map((s) => s.id),
      skill_id: primary?.id ?? page.skill_id ?? null,
      skill_name: primary?.name ?? page.skill_name ?? null,
      skill_prompt_preview: primary?.prompt_preview ?? page.skill_prompt_preview ?? null,
      skill_prompt_length: primary?.prompt_length ?? page.skill_prompt_length ?? null,
    };
  });
}
