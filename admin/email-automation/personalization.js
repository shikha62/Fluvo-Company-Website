export const DEFAULT_FALLBACKS = Object.freeze({
  first_name: 'there',
  industry_category: 'your industry',
  specific_observation: 'a few areas of your digital presence',
  growth_area: 'acquisition and conversion',
  specific_opportunity: 'technical optimization and measurable growth',
  opportunity_1: 'Technical SEO & GEO',
  opportunity_2: 'Conversion Rate Optimization',
  opportunity_3: 'Performance Marketing & Attribution',
  sender_name: 'Fluvo',
  sender_designation: 'Technology-Driven Digital Growth & Performance Engineering'
});

export const DEFAULT_COMPANY_MAPPINGS = Object.freeze({
  'fluvo.com': 'Fluvo',
  'acme.com': 'Acme'
});

export const DEFAULT_TEMPLATE = Object.freeze({
  name: 'Fluvo Growth Outreach',
  subject: 'A few growth opportunities for {{company_name}}',
  body: `Hi {{first_name}},

I came across {{company_name}} while researching {{industry_category}} and noticed {{specific_observation}}.

Based on our initial review, there appears to be an opportunity to improve {{growth_area}}, particularly around {{specific_opportunity}}.

Fluvo is a technology-driven digital growth partner specializing in Performance Marketing, Technical SEO & GEO, Web Engineering, CRO, Marketing Automation, and First-Party Attribution.

We connect these capabilities into a unified growth architecture designed to improve measurable outcomes across:

Acquisition → Conversion → Attribution → Revenue → Scale

For {{company_name}}, I'd specifically evaluate:

• {{opportunity_1}}
• {{opportunity_2}}
• {{opportunity_3}}

Our approach combines technical audits, data-driven experimentation, performance optimization, and continuous measurement against metrics such as CAC, ROAS, CVR, qualified pipeline, and attributable revenue.

Would you be open to a 20–30 minute conversation? I'd be happy to share the key opportunities we identified and a potential growth roadmap for {{company_name}}.

Best regards,

{{sender_name}}
{{sender_designation}}
Fluvo

Technology-Driven Digital Growth & Performance Engineering

Website: https://www.fluvo.in/
Email: connect@fluvo.in
Phone: +91 98711 38167

Technical SEO • Performance Marketing • Web Engineering • CRO • Automation • Attribution

Unsubscribe: {{unsubscribe_url}}`
});

const GENERIC_INBOXES = new Set([
  'accounts', 'admin', 'billing', 'careers', 'contact', 'founder', 'hello', 'help', 'info',
  'jobs', 'legal', 'mail', 'marketing', 'noreply', 'no-reply', 'office', 'press', 'privacy',
  'sales', 'security', 'support', 'team', 'webmaster'
]);

// Kept only for legacy reference; name detection no longer requires list membership.
const RECOGNIZED_NAME_PREFIXES = [
  'shikha', 'rahul', 'john', 'jane', 'amit', 'priya', 'ananya', 'arjun', 'rohan', 'aarav',
  'abhishek', 'aditya', 'akash', 'alex', 'alice', 'andrew', 'anjali', 'asha', 'ben', 'chloe',
  'daniel', 'david', 'deepak', 'divya', 'emma', 'fatima', 'george', 'harsh', 'ishaan', 'james',
  'jose', 'kavya', 'kevin', 'liam', 'lucas', 'maya', 'meera', 'mia', 'mohammed', 'neha', 'nikita',
  'olivia', 'parth', 'ravi', 'sara', 'simran', 'sofia', 'sophia', 'tanvi', 'varun', 'vikram', 'william'
];

const MULTI_LABEL_SUFFIXES = new Set(['co.in', 'com.au', 'co.uk', 'co.nz', 'com.sg', 'com.br']);

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (email.length > 254 || /[\s,;<>]/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2 || parts[0].length > 64) return false;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(parts[0]) &&
    parts[0][0] !== '.' && !parts[0].includes('..') &&
    parts[1].split('.').length >= 2 &&
    parts[1].split('.').every(label => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

function firstNameFromLocalPart(localPart) {
  // Split on common separators (. _ - +) and take the first non-empty token
  const tokens = localPart.split(/[._+-]+/).filter(Boolean);
  const firstToken = tokens[0] || '';

  // Reject if the whole local-part or the first token is a known generic inbox
  if (GENERIC_INBOXES.has(localPart.toLowerCase()) || GENERIC_INBOXES.has(firstToken.toLowerCase())) return 'there';

  // Case 1: separated form (e.g. firstname.lastname or first-name) → extract leading alpha from first token
  if (tokens.length > 1) {
    const alphaPrefix = firstToken.match(/^[a-z]+/i)?.[0] || '';
    return alphaPrefix.length >= 2 ? titleCase(alphaPrefix) : 'there';
  }

  const leadingName = localPart.match(/^([a-z]{2,})\d+[a-z]/i)?.[1];
  if (leadingName) return titleCase(leadingName);

  // Case 2: starts with digit or mixed token — extract leading alpha if meaningful
  if (/^\d/.test(localPart)) return 'there';

  const alphaLocal = localPart.replace(/\d+$/, '');
  // Case 3: trailing digits (e.g. shikhamandre31) — use prefix list to avoid guessing full concatenated name
  if (/\d+$/.test(localPart)) {
    const match = RECOGNIZED_NAME_PREFIXES.find(name => alphaLocal.toLowerCase().startsWith(name));
    return match ? titleCase(match) : 'there';
  }

  // Case 4: pure alphabetic single-word local-part (e.g. "vaibhav", "rahul", "john")
  // Use it directly — this is the main fix enabling names not in the hard-coded list
  return localPart.length >= 2 ? titleCase(localPart) : 'there';
}

function titleCase(value) {
  return value.toLowerCase().replace(/(^|[\s_-])([a-z])/g, (_, boundary, letter) => `${boundary}${letter.toUpperCase()}`);
}


export function companyDomainFromEmail(email) {
  const domain = normalizeEmail(email).split('@')[1] || '';
  const labels = domain.split('.');
  if (labels.length <= 2) return domain;
  const suffix = labels.slice(-2).join('.');
  return MULTI_LABEL_SUFFIXES.has(suffix) ? labels.slice(-3).join('.') : labels.slice(-2).join('.');
}

export function companyNameFromDomain(domain, mappings = DEFAULT_COMPANY_MAPPINGS) {
  const normalizedDomain = normalizeEmail(domain);
  const mapped = Object.entries(mappings || {}).find(([key]) => normalizeEmail(key) === normalizedDomain)?.[1];
  if (mapped) return String(mapped).trim();

  const registeredDomain = companyDomainFromEmail(`x@${normalizedDomain}`);
  const labels = registeredDomain.split('.');
  const name = labels[0] || 'Company';
  return titleCase(name.replace(/[._-]+/g, ' '));
}

export function parseLeadEmail(value, overrides = {}, options = {}) {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) return { email, valid: false, error: 'Enter a valid email address.' };

  const companyDomain = companyDomainFromEmail(email);
  const inferredName = firstNameFromLocalPart(email.split('@')[0]);
  const explicitFirstName = overrides.first_name || overrides.firstName;
  const fullName = overrides.full_name || overrides.fullName;
  const providedName = explicitFirstName || (fullName ? String(fullName).trim().split(/\s+/)[0] : '');
  const firstName = String(providedName || inferredName).trim() || 'there';
  const companyName = String(overrides.company_name || overrides.companyName ||
    companyNameFromDomain(companyDomain, options.companyMappings)).trim() || companyNameFromDomain(companyDomain);

  return {
    email,
    firstName,
    companyDomain,
    companyName,
    industry: String(overrides.industry || '').trim(),
    website: String(overrides.website || '').trim(),
    opportunity1: String(overrides.opportunity_1 || overrides.opportunity1 || '').trim(),
    opportunity2: String(overrides.opportunity_2 || overrides.opportunity2 || '').trim(),
    opportunity3: String(overrides.opportunity_3 || overrides.opportunity3 || '').trim(),
    valid: true
  };
}

export function renderTemplate(template, recipient, options = {}) {
  const fallbacks = { ...DEFAULT_FALLBACKS, ...(options.fallbacks || {}) };
  const values = {
    ...fallbacks,
    company_name: recipient.companyName || recipient.company_name || companyNameFromDomain(recipient.companyDomain || recipient.company_domain),
    company_domain: recipient.companyDomain || recipient.company_domain || '',
    first_name: recipient.firstName || recipient.first_name || fallbacks.first_name,
    industry_category: recipient.industry || recipient.industry_category || fallbacks.industry_category,
    opportunity_1: recipient.opportunity1 || recipient.opportunity_1 || fallbacks.opportunity_1,
    opportunity_2: recipient.opportunity2 || recipient.opportunity_2 || fallbacks.opportunity_2,
    opportunity_3: recipient.opportunity3 || recipient.opportunity_3 || fallbacks.opportunity_3,
    unsubscribe_url: options.unsubscribeUrl || '{{unsubscribe_url}}',
    sender_name: options.senderName || fallbacks.sender_name,
    sender_designation: options.senderDesignation || fallbacks.sender_designation
  };
  const render = source => String(source || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, key) => {
    const value = values[key.toLowerCase()];
    return value === undefined || value === null ? match : String(value);
  });

  const subject = render(template.subject);
  const body = render(template.body);
  const unresolved = [...new Set(`${subject}\n${body}`.match(/\{\{\s*[^{}]+\s*\}\}/g) || [])];
  return { subject, body, unresolved, valid: unresolved.length === 0 };
}