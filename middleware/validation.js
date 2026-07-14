function validateActivity(data) {
  const errors = [];
  if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
    errors.push('Title is required');
  }
  const validDifficulties = ['easy', 'medium', 'hard'];
  if (data.difficulty && !validDifficulties.includes(data.difficulty)) {
    errors.push(`Invalid difficulty. Must be one of: ${validDifficulties.join(', ')}`);
  }
  return errors;
}

function validateQuestion(data) {
  const errors = [];
  if (!data.question_text || typeof data.question_text !== 'string' || data.question_text.trim().length === 0) {
    errors.push('question_text is required');
  }
  const validTypes = ['text', 'image', 'audio', 'image_text', 'fill_in', 'grammar', 'reading', 'mixed'];
  if (!data.type || !validTypes.includes(data.type)) {
    errors.push(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
  }
  if (!Array.isArray(data.choices) || data.choices.length < 2) {
    errors.push('At least 2 choices are required');
  }
  if (Array.isArray(data.choices)) {
    const correctCount = data.choices.filter(c => c.is_correct).length;
    if (correctCount !== 1) {
      errors.push('Exactly one correct answer is required');
    }
  }
  return errors;
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '');
}

module.exports = { validateActivity, validateQuestion, sanitizeString };
