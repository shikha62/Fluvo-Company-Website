import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TEMPLATE,
  isValidEmail,
  parseLeadEmail,
  renderTemplate
} from './personalization.js';

test('parses separated names, recognized concatenated names, and generic inboxes', () => {
  assert.deepEqual(
    (({ firstName, companyName }) => ({ firstName, companyName }))(parseLeadEmail('shikhamandre31@fluvo.com')),
    { firstName: 'Shikha', companyName: 'Fluvo' }
  );
  assert.equal(parseLeadEmail('rahul.sharma@acme.com').firstName, 'Rahul');
  assert.equal(parseLeadEmail('rahul@acme.com').firstName, 'Rahul');
  assert.equal(parseLeadEmail('rahul@acme.com').companyName, 'Acme');
  assert.equal(parseLeadEmail('john-doe@example.com').firstName, 'John');
  assert.equal(parseLeadEmail('vibhanshu07ashu@gmail.com').firstName, 'Vibhanshu');
  assert.equal(parseLeadEmail('info@company.com').firstName, 'there');
  assert.equal(parseLeadEmail('support@company.com').firstName, 'there');
  assert.equal(parseLeadEmail('founder@company.com').firstName, 'there');
  // Pure alphabetic local-parts are now used as-is (vaibhav@, randomstring@, etc.)
  assert.equal(parseLeadEmail('randomstring@company.com').firstName, 'Randomstring');
  assert.equal(parseLeadEmail('vaibhav@company.com').firstName, 'Vaibhav');
});


test('manual CSV values override inference and domain names are display labels', () => {
  const lead = parseLeadEmail('marketing@bright-tech.io', {
    first_name: 'Morgan',
    company_name: 'Bright Technology Ltd'
  });
  assert.equal(lead.firstName, 'Morgan');
  assert.equal(lead.companyName, 'Bright Technology Ltd');
  assert.equal(parseLeadEmail('team@shop.example.co.in').companyDomain, 'example.co.in');
  assert.equal(parseLeadEmail('team@bright-tech.io').companyName, 'Bright Tech');
  assert.equal(parseLeadEmail('person@example.com', { full_name: 'Alexandra Maria Doe' }).firstName, 'Alexandra');
});

test('validates email addresses and identifies invalid leads', () => {
  assert.equal(isValidEmail('person+tag@company.in'), true);
  assert.equal(isValidEmail('invalid-email'), false);
  assert.equal(parseLeadEmail('invalid-email').valid, false);
});

test('renders defaults and rejects unresolved template variables', () => {
  const rendered = renderTemplate(DEFAULT_TEMPLATE, parseLeadEmail('info@company.com'), {
    unsubscribeUrl: 'https://admin.fluvo.in/api/email/unsubscribe?token=test'
  });
  assert.equal(rendered.valid, true);
  assert.match(rendered.body, /Hi there,/);
  assert.match(rendered.body, /Unsubscribe: https:\/\/admin\.fluvo\.in/);

  const incomplete = renderTemplate({ subject: '{{unknown}}', body: 'Hi {{first_name}}' }, parseLeadEmail('rahul@acme.com'));
  assert.equal(incomplete.valid, false);
  assert.deepEqual(incomplete.unresolved, ['{{unknown}}']);
});