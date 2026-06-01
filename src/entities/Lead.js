import { base44 } from '@/api/base44Client';

/**
 * Lead — every inquiry that enters the sales funnel (events, catering, large reservations).
 * Owned by the Sales-Closer agent of the originating CampaignUnit.
 *
 * Backend schema:
 *   lead_id:             string  unique
 *   source_unit:         string                    (CampaignUnit.unit_id)
 *   channel:             string                    ("APP_INQUIRY"|"WHATSAPP"|"PHONE"|"WALK_IN"|"REFERRAL")
 *   status:              string                    ("NEW"|"QUALIFIED"|"QUOTED"|"BOOKED"|"LOST"|"COLD")
 *   contact_name:        string
 *   contact_phone:       string
 *   contact_email:       string  nullable
 *   qualifier_answers:   json                      ({event_date, event_type, guest_count, budget_per_person})
 *   conversation_log:    json                      (array of {role, content, timestamp})
 *   quoted_amount_ils:   number  nullable
 *   booked_amount_ils:   number  nullable
 *   reservation_id:      string  nullable          (link to Reservation if BOOKED)
 *   lost_reason:         string  nullable          ("PRICE"|"DATE_UNAVAIL"|"GHOSTED"|"OTHER")
 *   assigned_to_agent:   string                    (Sales-Closer codename)
 *   owner_alerted:       boolean default false     (true once owner saw it in Inbox)
 *   utm:                 json                      ({source, medium, campaign, content})
 *   created_date:        datetime
 *   updated_date:        datetime
 */
export const Lead = base44.entities.Lead;
