"""Extend the existing guarded live runner for this disposable-account audit.

Only the CI working copy of the acceptance runner is changed. Application
code, production containers, credentials and cleanup boundaries are untouched.
"""
from pathlib import Path

target = Path("deployment/creator-flow-live-check.cjs")
source = target.read_text()

def replace_once(old, new):
    global source
    if source.count(old) != 1:
        raise RuntimeError("Acceptance runner changed; review audit integration")
    source = source.replace(old, new, 1)

extra = r'''
  async function fullQuestionnaireChecks(fixture) {
    const pages = [
      ['quick-v2-introduction', { preferred_name: 'Disposable Audit', languages: 'English', ethnicity: 'Synthetic test', social_style: 'Quiet evenings', pets: 'No pets', relationship_status: 'Private' }],
      ['quick-v2-personal', { home_background: 'Synthetic place', family_profile: 'Keep family private', appearance_profile: 'Synthetic description', personal_highlights: 'Reading, cooking, walking', social_links: 'https://example.test/creator' }],
      ['quick-v2-favourites', { fav_foods: 'Pasta', music_preferences: 'Pop', fav_movie_genre: 'Comedy', sports_preferences: 'None', travel_favourites: 'Beaches', drink_of_choice: 'None' }],
      ['quick-v2-preferences', { sexual_orientation: 'Private', dom_sub: 'Private', turn_ons_including_kinks: 'Private', turn_offs: 'Disrespect', boundaries: 'Do not share personal contact details' }],
      ['quick-v2-account', { full_name: 'Disposable Creator Audit', date_of_birth: '01 / 01 / 1990', email_address: fixture.email, phone_number: 'Synthetic test only' }],
    ];
    const expected = {};
    const application = async () => (await ownRows('creator_applications', fixture, 'status,submitted_at,updated_at,answers'))[0];
    const jsonPost = (route, body, actor = fixture) => app(route, actor, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    for (const [section, answers] of pages) {
      const html = await page200('/creator/onboarding?step=questionnaire&section=' + section, fixture);
      assert(html.includes('data-questionnaire-page="' + section + '"'), 'Questionnaire section did not render: ' + section);
      const before = await application();
      const response = await jsonPost('/creator-auth/onboarding/draft', { section, revision: before?.updated_at || '', answers });
      assert(response.status === 200 && (await response.json()).ok, 'Questionnaire section save failed: ' + section);
      Object.assign(expected, answers);
      const after = await application();
      for (const [key, value] of Object.entries(expected)) assert(after.answers[key] === value, 'Saving a section lost an answer: ' + key);
      const stale = await jsonPost('/creator-auth/onboarding/draft', { section, revision: before?.updated_at || '', answers: { [Object.keys(answers)[0]]: 'Stale overwrite' } });
      assert(stale.status === 409, 'Stale questionnaire revision was allowed to overwrite newer answers'); await stale.body?.cancel();
    }
    const folder = 'https://drive.google.com/drive/folders/disposable-audit-' + stamp;
    const beforeFolder = await application();
    for (let duplicate = 0; duplicate < 2; duplicate++) {
      const saved = await jsonPost('/creator-auth/content-folders', { url: folder });
      assert(saved.status === 200 && (await saved.json()).folders.length === 1, 'Folder link save or duplicate handling failed');
    }
    const invalidFolder = await jsonPost('/creator-auth/content-folders', { url: 'https://example.test/not-a-folder' });
    assert(invalidFolder.status === 400, 'Invalid folder link was accepted'); await invalidFolder.body?.cancel();
    const afterFolder = await application();
    for (const [key, value] of Object.entries(expected)) assert(afterFolder.answers[key] === value, 'Saving a folder lost questionnaire answers');
    assert(afterFolder.updated_at !== beforeFolder.updated_at, 'Folder write did not advance the draft revision');
    const invalidSection = await jsonPost('/creator-auth/onboarding/draft', { section: 'not-a-section', revision: afterFolder.updated_at, answers: { preferred_name: 'Invalid' } });
    assert(invalidSection.status === 400, 'Invalid questionnaire section was accepted'); await invalidSection.body?.cancel();
    const foreignField = await jsonPost('/creator-auth/onboarding/draft', { section: 'quick-v2-introduction', revision: afterFolder.updated_at, answers: { full_name: 'Wrong section' } });
    assert(foreignField.status === 400, 'Out-of-section questionnaire field was accepted'); await foreignField.body?.cancel();
    await loginAgain(fixture);
    const returned = await application();
    for (const [key, value] of Object.entries(expected)) assert(returned.answers[key] === value, 'Fresh login lost a questionnaire answer: ' + key);
    assert(JSON.parse(returned.answers.content_folder_links).length === 1, 'Fresh login lost saved folder');
    assert(returned.status === 'draft' && !returned.submitted_at, 'Autosave or folder write unexpectedly submitted onboarding');
    const content = await page200('/creator/onboarding?step=content', fixture);
    assert(content.includes('Awaiting import'), 'Folder link is not presented as awaiting import');
    const invalidLogin = await post('/creator-auth/login', null, { email: fixture.email, password: randomBytes(24).toString('base64url'), portal: config.brand });
    assert(invalidLogin.status === 303 && location(invalidLogin).searchParams.get('error') === '1', 'Incorrect password did not produce a controlled login error');
    assert(!invalidLogin.headers.getSetCookie().some(value => value.startsWith('twin_creator_session=')), 'Incorrect password issued a creator session'); await invalidLogin.body?.cancel();
    passed('All five questionnaire sections and 26 answers saved through public autosave; prior answers, folder links and draft state survive fresh login; stale writes, invalid fields, invalid folders and incorrect passwords are rejected');
  }
'''
replace_once('  async function recoveryConfiguration(fixture) {', extra + '\n  async function recoveryConfiguration(fixture) {')
replace_once("    const source = config.mode === 'flow-only' ? null : await uploadChecks(a, b);", "    await fullQuestionnaireChecks(a);\n    const source = config.mode === 'flow-only' ? null : await uploadChecks(a, b);")
replace_once("    if (config.mode === 'photo-boundaries') await photoBoundaryChecks(a, b);", "    if (config.mode === 'photo-boundaries' || config.mode === 'large') await photoBoundaryChecks(a, b);")
replace_once("    const response = await post('/creator-auth/signup', null, { email: fixture.email, password: fixture.password, display_name: fixture.name, ...(invitation ? { agency_code: invitation.code } : {}) });", "    const fields = { email: fixture.email, password: fixture.password, display_name: fixture.name, ...(invitation ? { agency_code: invitation.code } : {}) };\n    const enhanced = suffix === 'complete';\n    const body = enhanced ? new FormData() : new URLSearchParams();\n    for (const [key, value] of Object.entries(fields)) body.set(key, value);\n    const response = await app('/creator-auth/signup', null, { method: 'POST', body, headers: enhanced ? { Accept: 'application/json' } : {} });")
replace_once("    assert(response.status === 303 && fixture.id && fixture.auth_user_id && location(response).pathname === '/creator/onboarding', 'Normal signup did not create account and reach onboarding');", "    const signupReachedOnboarding = enhanced ? response.status === 200 && (await response.json()).next === '/creator/onboarding' : response.status === 303 && location(response).pathname === '/creator/onboarding';\n    assert(signupReachedOnboarding && fixture.id && fixture.auth_user_id, 'Normal signup did not create account and reach onboarding');\n    passed(enhanced ? 'Enhanced multipart JSON signup returns onboarding and a secure session' : 'Fallback HTML form signup redirects to onboarding with a secure session');")
replace_once("    fixture.cookie = cookieFrom(response, 'twin_creator_session'); await response.body?.cancel();", "    fixture.cookie = cookieFrom(response, 'twin_creator_session'); if (!response.bodyUsed) await response.body?.cancel();")
# Exercise the combined picker path used by the new UI. Keep the exact fixture
# filenames, byte bounds, ownership proofs and cleanup manifest scope intact.
for category in ['content_sfw_image', 'content_nsfw_image', 'content_sfw_video', 'content_nsfw_video']:
    source = source.replace("'" + category + "'", "'content'")
source = source.replace('/creator-auth/files?kind=content_sfw_video', '/creator-auth/files?kind=content')
source = source.replace('across categories', 'through the combined picker endpoint')
source = source.replace('in both image categories', 'through the combined picker endpoint')
target.write_text(source)
print('Extended audit prepared; production app source unchanged')
