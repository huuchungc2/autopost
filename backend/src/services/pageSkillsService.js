import { query } from '../db.js';

export async function getPageSkills(pageId) {
  return query(
    `SELECT s.id, s.name, s.description,
            LEFT(s.system_prompt, 200) AS prompt_preview,
            CHAR_LENGTH(s.system_prompt) AS prompt_length,
            ps.sort_order
     FROM page_skills ps
     JOIN skills s ON s.id = ps.skill_id
     WHERE ps.page_id = ?
     ORDER BY ps.sort_order ASC, s.name ASC`,
    [pageId]
  );
}

export async function getSkillsGroupedByPageIds(pageIds) {
  if (!pageIds.length) return {};
  const placeholders = pageIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT ps.page_id, s.id, s.name, s.description,
            LEFT(s.system_prompt, 200) AS prompt_preview,
            CHAR_LENGTH(s.system_prompt) AS prompt_length,
            ps.sort_order
     FROM page_skills ps
     JOIN skills s ON s.id = ps.skill_id
     WHERE ps.page_id IN (${placeholders})
     ORDER BY ps.sort_order ASC, s.name ASC`,
    pageIds
  );
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

  await query('UPDATE fb_pages SET skill_id = ? WHERE id = ?', [ids[0] || null, pageId]);
}

export async function assertSkillLinkedToPage(pageId, skillId) {
  if (!skillId) return null;
  const rows = await query(
    `SELECT s.id, s.name, s.system_prompt
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

export async function resolveSkillPrompt(pageId, skillId = null) {
  const skills = await query(
    `SELECT s.id, s.name, s.system_prompt, ps.sort_order
     FROM page_skills ps
     JOIN skills s ON s.id = ps.skill_id
     WHERE ps.page_id = ?
     ORDER BY ps.sort_order ASC, s.name ASC`,
    [pageId]
  );

  if (!skills.length) {
    const legacy = await query(
      `SELECT s.id, s.name, s.system_prompt
       FROM fb_pages fp
       LEFT JOIN skills s ON s.id = fp.skill_id
       WHERE fp.id = ? AND fp.skill_id IS NOT NULL`,
      [pageId]
    );
    if (legacy[0]?.id) {
      return { skills: [legacy[0]], skillPrompt: legacy[0].system_prompt, activeSkill: legacy[0] };
    }
    return { skills: [], skillPrompt: '', activeSkill: null };
  }

  if (skillId) {
    const picked = skills.find((s) => s.id === Number(skillId));
    if (!picked) {
      const error = new Error('Skill chưa được gắn với fanpage này');
      error.status = 400;
      throw error;
    }
    return { skills, skillPrompt: picked.system_prompt, activeSkill: picked };
  }

  if (skills.length === 1) {
    return { skills, skillPrompt: skills[0].system_prompt, activeSkill: skills[0] };
  }

  const combined = skills
    .map((s, i) => `[Hướng dẫn ${i + 1}: ${s.name}]\n${s.system_prompt}`)
    .join('\n\n');
  return { skills, skillPrompt: combined, activeSkill: skills[0] };
}

export async function enrichPagesWithSkills(pages) {
  if (!pages.length) return pages;
  const grouped = await getSkillsGroupedByPageIds(pages.map((p) => p.id));
  return pages.map((page) => {
    const skills = grouped[page.id] || [];
    return {
      ...page,
      skills,
      skill_ids: skills.map((s) => s.id),
      skill_id: skills[0]?.id ?? page.skill_id ?? null,
      skill_name: skills[0]?.name ?? page.skill_name ?? null,
      skill_prompt_preview: skills[0]?.prompt_preview ?? page.skill_prompt_preview ?? null,
      skill_prompt_length: skills[0]?.prompt_length ?? page.skill_prompt_length ?? null,
    };
  });
}
