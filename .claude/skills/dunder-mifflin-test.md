# Dunder Mifflin End-to-End Platform Test

## Description
Run a comprehensive end-to-end test of TheSalesTrainer.AI platform using the Dunder Mifflin Paper Company as a test organization. Creates test users, generates a playbook, runs sales challenges, reviews scores, and validates the manager dashboard — then produces a graded test report.

## Prerequisites
- The Supabase service role key must be provided by the user (ask if not available)
- The Supabase project URL: `https://tmvunfekgybslhmzznsy.supabase.co`
- The anon key is in `.env` as `VITE_SUPABASE_PUBLISHABLE_KEY`

## Test Scenario

**Organization:** Dunder Mifflin Paper Company
- Industry: B2B Paper & Office Supplies
- 10-seat company plan

**Test Users:**

| Name | Email | Role | Password |
|------|-------|------|----------|
| Michael Scott | michael.scott@dundermifflin.com | Manager | DunderMifflin2024! |
| Jim Halpert | jim.halpert@dundermifflin.com | Employee/Trainee | DunderMifflin2024! |
| Dwight Schrute | dwight.schrute@dundermifflin.com | Employee/Trainee | DunderMifflin2024! |

## Steps

### Step 1: Clean Up Previous Test Data
Before creating new accounts, check if these test users already exist and clean them up:
```bash
# Check for existing users by email
curl -s -X GET "https://tmvunfekgybslhmzznsy.supabase.co/auth/v1/admin/users?page=1&per_page=50" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "apikey: $SERVICE_ROLE_KEY" | python3 -c "
import json,sys
data=json.load(sys.stdin)
emails=['michael.scott@dundermifflin.com','jim.halpert@dundermifflin.com','dwight.schrute@dundermifflin.com']
for u in data.get('users',[]):
  if u['email'] in emails:
    print(f\"Found existing user: {u['email']} -> {u['id']}\")
"
```
If users exist, delete them (and their profiles/org data will cascade) before recreating:
```bash
curl -s -X DELETE "https://tmvunfekgybslhmzznsy.supabase.co/auth/v1/admin/users/$USER_ID" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "apikey: $SERVICE_ROLE_KEY"
```

### Step 2: Create Test Users via Supabase Admin API
Create each user with `email_confirm: true` to bypass email verification:
```bash
curl -s -X POST "https://tmvunfekgybslhmzznsy.supabase.co/auth/v1/admin/users" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "michael.scott@dundermifflin.com",
    "password": "DunderMifflin2024!",
    "email_confirm": true,
    "user_metadata": { "full_name": "Michael Scott" }
  }'
```
Repeat for Jim Halpert and Dwight Schrute. Save the returned user IDs.

### Step 3: Create Organization
Insert organization into the `organizations` table:
```bash
curl -s -X POST "https://tmvunfekgybslhmzznsy.supabase.co/rest/v1/organizations" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "name": "Dunder Mifflin Paper Company",
    "created_by": "<MICHAEL_USER_ID>",
    "max_seats": 10,
    "subscription_status": "active",
    "plan_type": "company"
  }'
```
Save the returned organization ID.

### Step 4: Set Up Profiles
Update each user's profile with the organization ID and correct role:
```bash
# Michael Scott - Manager
curl -s -X PATCH "https://tmvunfekgybslhmzznsy.supabase.co/rest/v1/profiles?id=eq.<MICHAEL_ID>" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"organization_id": "<ORG_ID>", "role": "manager", "full_name": "Michael Scott"}'

# Jim Halpert - Employee
curl -s -X PATCH "https://tmvunfekgybslhmzznsy.supabase.co/rest/v1/profiles?id=eq.<JIM_ID>" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"organization_id": "<ORG_ID>", "role": "employee", "full_name": "Jim Halpert"}'

# Dwight Schrute - Employee
curl -s -X PATCH "https://tmvunfekgybslhmzznsy.supabase.co/rest/v1/profiles?id=eq.<DWIGHT_ID>" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"organization_id": "<ORG_ID>", "role": "employee", "full_name": "Dwight Schrute"}'
```

### Step 5: Generate Playbook
Call the `generate-playbook` edge function. First sign in as Michael to get a JWT:
```bash
# Sign in as Michael
AUTH_RESPONSE=$(curl -s -X POST "https://tmvunfekgybslhmzznsy.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"michael.scott@dundermifflin.com","password":"DunderMifflin2024!"}')
MICHAEL_JWT=$(echo $AUTH_RESPONSE | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
```
Then generate the playbook:
```bash
curl -s -X POST "https://tmvunfekgybslhmzznsy.supabase.co/functions/v1/generate-playbook" \
  -H "Authorization: Bearer $MICHAEL_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Dunder Mifflin Paper Company",
    "products_services": "Premium paper products, office supplies, printing solutions, managed print services, sustainable paper options (FSC-certified), custom letterhead and business cards",
    "target_audience": "Small to mid-size businesses (10-500 employees), office managers, procurement departments, law firms, medical offices, schools and universities",
    "top_problems": "Rising paper costs eating into budgets, unreliable delivery from big-box stores, poor print quality affecting professional image, lack of personalized service from large vendors, sustainability concerns with paper usage",
    "value_proposition": "Personal relationship-driven paper supply with guaranteed next-day local delivery, competitive pricing vs big-box stores, dedicated account manager for every client, FSC-certified sustainable options, and a 150+ year legacy of quality",
    "website_url": "https://dundermifflin.com",
    "tone": "Professional but personable",
    "sales_model": "b2b"
  }'
```
Save the playbook result. Then insert it into the `playbooks` table tied to the org.

### Step 6: Run Sales Challenges
For each employee (Jim and Dwight), run a full sales challenge:

**6a. Create a challenge attempt record:**
```bash
curl -s -X POST "https://tmvunfekgybslhmzznsy.supabase.co/rest/v1/sales_challenge_attempts" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "employee_id": "<EMPLOYEE_USER_ID>",
    "organization_id": "<ORG_ID>",
    "status": "in_progress"
  }'
```
Save the attempt ID.

**6b. Sign in as the employee to get their JWT:**
```bash
AUTH_RESPONSE=$(curl -s -X POST "https://tmvunfekgybslhmzznsy.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"jim.halpert@dundermifflin.com","password":"DunderMifflin2024!"}')
JIM_JWT=$(echo $AUTH_RESPONSE | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
```

**6c. Send messages to the sales-challenge function (4 rounds):**
Each call sends the full conversation history. First message is just the user's opening:
```bash
# Round 1
curl -s -X POST "https://tmvunfekgybslhmzznsy.supabase.co/functions/v1/sales-challenge" \
  -H "Authorization: Bearer $JIM_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "attemptId": "<ATTEMPT_ID>",
    "messages": [{"role": "user", "content": "Hi there! I am Jim from Dunder Mifflin Paper Company. I understand you might be looking for a new paper supplier?"}]
  }'
```
Each subsequent round appends the AI's previous response and the user's next message to the messages array.

**Sales conversation style guide for test messages:**
- **Jim Halpert style:** Casual, consultative, asks discovery questions, uses humor, tries the no-risk pilot close
- **Dwight Schrute style:** Aggressive, product-focused, leads with features and certifications, pushes hard for the close

Run 4 rounds of conversation for each employee. Save all responses.

**6d. After the conversation ends, call challenge-review:**
```bash
curl -s -X POST "https://tmvunfekgybslhmzznsy.supabase.co/functions/v1/challenge-review" \
  -H "Authorization: Bearer $EMPLOYEE_JWT" \
  -H "Content-Type: application/json" \
  -d '{"attemptId": "<ATTEMPT_ID>"}'
```

### Step 7: Validate Manager Dashboard Data
Sign in as Michael and verify he can see employee data:
```bash
# Fetch employees in the org
curl -s "https://tmvunfekgybslhmzznsy.supabase.co/rest/v1/profiles?organization_id=eq.<ORG_ID>&select=*" \
  -H "Authorization: Bearer $MICHAEL_JWT" \
  -H "apikey: $ANON_KEY"

# Fetch challenge attempts for the org
curl -s "https://tmvunfekgybslhmzznsy.supabase.co/rest/v1/sales_challenge_attempts?organization_id=eq.<ORG_ID>&select=*" \
  -H "Authorization: Bearer $MICHAEL_JWT" \
  -H "apikey: $ANON_KEY"
```

### Step 8: Generate Test Report
After all steps, produce a comprehensive test report covering:

1. **Setup Results** - Were all users, org, and playbook created successfully?
2. **Playbook Quality** - Does the generated playbook have all 8 sections? Is it relevant to paper sales?
3. **Sales Challenge Quality** - Were AI prospects realistic? Did conversations flow naturally? Did they end properly?
4. **Scoring Quality** - Were scores differentiated between Jim (consultative) and Dwight (aggressive)? Was feedback actionable?
5. **Manager Visibility** - Can Michael see all employee data, scores, and challenge history?
6. **Auth Flow** - Does role-based routing work correctly?
7. **Issues Found** - Categorize as P0/P1/P2/P3 with file references
8. **Overall Grade** - Letter grade with justification

Save the report to `DUNDER_MIFFLIN_TEST_REPORT.md` in the project root.

## Important Notes
- The service role key is sensitive — never commit it to git or save it in files
- The `$ANON_KEY` can be read from `.env` (`VITE_SUPABASE_PUBLISHABLE_KEY`)
- All edge function calls require a valid user JWT (not the service role key) in the Authorization header
- Direct database operations (profiles, organizations, attempts) can use the service role key
- Always save API responses to `/tmp/` files for analysis — never to the repo
- If a user already exists, the admin create API will return an error — clean up first
