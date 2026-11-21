/**
 * Shared Authentication Module
 * Handles Supabase auth state, user profile, and auth helpers
 */

import { createClient } from '@supabase/supabase-js';

// Supabase configuration - REPLACE WITH YOUR VALUES
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth state
let currentUser = null;
let userProfile = null;
let authListeners = [];

/**
 * Initialize auth - call on every page load
 */
export async function initAuth() {
  // Get initial session
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    await fetchUserProfile(currentUser.id);
  }

  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user ?? null;
    if (currentUser) {
      await fetchUserProfile(currentUser.id);
    } else {
      userProfile = null;
    }
    notifyAuthListeners();
  });

  return currentUser;
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Get user profile
 */
export function getUserProfile() {
  return userProfile;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  return !!currentUser;
}

/**
 * Check if user has specific role
 */
export function hasRole(role) {
  return userProfile?.role === role;
}

/**
 * Check if user is a provider
 */
export function isProvider() {
  return hasRole('provider');
}

/**
 * Check if user is a seeker
 */
export function isSeeker() {
  return hasRole('seeker');
}

/**
 * Fetch user profile from database
 */
async function fetchUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching profile:', error);
      userProfile = { id: userId, role: 'seeker' }; // default
    } else {
      userProfile = data || { id: userId, role: 'seeker' };
    }
  } catch (err) {
    console.error('Error fetching profile:', err);
    userProfile = { id: userId, role: 'seeker' };
  }
}

/**
 * Subscribe to auth changes
 */
export function onAuthChange(callback) {
  authListeners.push(callback);
  // Call immediately with current state
  callback(currentUser, userProfile);
  return () => {
    authListeners = authListeners.filter(l => l !== callback);
  };
}

function notifyAuthListeners() {
  authListeners.forEach(cb => cb(currentUser, userProfile));
}

/**
 * Sign up with email/password
 */
export async function signUp(email, password, role, metadata = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role, ...metadata }
    }
  });

  if (error) throw error;

  // Profile will be created via trigger or we create it
  if (data.user) {
    await createProfile(data.user.id, role, metadata);
  }

  return data;
}

/**
 * Create user profile
 */
async function createProfile(userId, role, metadata) {
  const { error } = await supabase
    .from('user_profiles')
    .insert({
      id: userId,
      role,
      full_name: metadata.full_name || '',
      phone: metadata.phone || '',
      line_id: metadata.line_id || '',
      province: metadata.province || '',
      district: metadata.district || '',
      subdistrict: metadata.subdistrict || '',
      avatar_url: metadata.avatar_url || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

  if (error) console.error('Error creating profile:', error);
}

/**
 * Sign in with email/password
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

/**
 * Sign out
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentUser = null;
  userProfile = null;
  notifyAuthListeners();
}

/**
 * Update user profile
 */
export async function updateProfile(updates) {
  if (!currentUser) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', currentUser.id)
    .select()
    .single();

  if (error) throw error;
  userProfile = data;
  notifyAuthListeners();
  return data;
}

/**
 * Upload avatar image
 */
export async function uploadAvatar(file) {
  if (!currentUser) throw new Error('Not authenticated');

  const fileExt = file.name.split('.').pop();
  const fileName = `${currentUser.id}/avatar.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName);

  await updateProfile({ avatar_url: data.publicUrl });
  return data.publicUrl;
}

/**
 * Format THB currency
 */
export function formatTHB(amount) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format relative time in Thai
 */
export function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'เมื่อสักครู่';
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;

  // Buddhist Era for full dates
  const beYear = date.getFullYear() + 543;
  return `${date.getDate()} ${getThaiMonth(date.getMonth())} ${beYear}`;
}

function getThaiMonth(monthIndex) {
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  return months[monthIndex];
}

/**
 * Get Thai province list (for autocomplete)
 */
export const THAI_PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น',
  'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร',
  'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก',
  'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นครสีธรรมราช',
  'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
  'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง',
  'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต',
  'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยะลา', 'ยโสธร', 'ร้อยเอ็ด',
  'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน',
  'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
  'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย',
  'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง',
  'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี', 'อำนาจเจริญ'
];

/**
 * Thai districts by province (major provinces)
 */
export const THAI_DISTRICTS = {
  'กรุงเทพมหานคร': [
    'พระนคร', 'ดุสิต', 'หนองจอก', 'บางรัก', 'บางเขน', 'บางกะปิ', 'ปทุมวัน', 'ป้อมปราบศัตรูพ่าย',
    'พระโขนง', 'มีนบุรี', 'ลาดกระบัง', 'ยานนาวา', 'สัมพันธวงศ์', 'พญาไท', 'ธนบุรี', 'บางกอกใหญ่',
    'ห้วยขวาง', 'คลองสาน', 'ตลิ่งชัน', 'บางกอกน้อย', 'บางขุนเทียน', 'ภาษีเจริญ', 'หนองแขม',
    'ราษฎร์บูรณะ', 'บางพลัด', 'ดินแดง', 'บึงกุ่ม', 'สาทร', 'บางซื่อ', 'จตุจักร', 'บางคอแหลม',
    'ประเวศ', 'คลองเตย', 'สวนหลวง', 'จอมทอง', 'ดอนเมือง', 'ราษฎร์บูรณะ', 'ลาดพร้าว',
    'วังทองหลาง', 'คลองสามวา', 'บางนา', 'ทวีวัฒนา', 'บางบอน', 'สายไหม', 'คันนายาว', 'สะพานสูง',
    'วังน้อย', 'คลองสามวา', 'บางขุนเทียน', 'ทุ่งครุ', 'บางบอน'
  ],
  'สมุทรปราการ': [
    'เมืองสมุทรปราการ', 'บางบ่อ', 'บางพลี', 'พระประแดง', 'พระสมุทรเจดีย์', 'บางเสาธง'
  ],
  'นนทบุรี': [
    'เมืองนนทบุรี', 'บางกรวย', 'บางใหญ่', 'บางบัวทอง', 'ไทรน้อย', 'ปากเกร็ด'
  ],
  'ปทุมธานี': [
    'เมืองปทุมธานี', 'คลองหลวง', 'ธัญบุรี', 'หนองเสือ', 'ลาดหลุมแก้ว', 'สำโรง'
  ],
  'ชลบุรี': [
    'เมืองชลบุรี', 'บ้านบึง', 'หนองใหญ่', 'บางละมุง', 'พานทอง', 'โพธิ์พระยา', 'ศรีราชา',
    'เกาะสีชัง', 'สัตหีบ', 'บ่อทอง', 'เกาะจันทร์'
  ],
  'เชียงใหม่': [
    'เมืองเชียงใหม่', 'แม่ออน', 'แม่อาย', 'เชียงdao', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง',
    'แม่แวง', 'ฮอด', 'สันกำแพง', 'สันป่าตอง', 'สันไก่', 'หางดง', 'ฮอด', 'ชัยปรากร',
    'เวียงแหง', 'แม่อาย', 'อมก๋อย', 'ดอยเต่า', 'ดอยสะเก็ด', 'แม่วาง', 'แม่วาง', 'เวียงหนองหลง',
    'แม่แจ่ม', 'เวียงแหง', 'ดอยหล่อ', 'แม่ริม', 'สันกำแพง', 'สันป่าตอง', 'สันไก่', 'หางดง',
    'ฮอด', 'ชัยปรากร', 'เวียงแหง', 'อมก๋อย', 'ดอยเต่า', 'ดอยสะเก็ด', 'แม่วาง'
  ],
  'ขอนแก่น': [
    'เมืองขอนแก่น', 'บ้านไผ่', 'หนองนาคำ', 'ชุมแพ', 'สิรินธร', 'น้ำพอง', 'อุบลรัตน์', 'กระนวน',
    'บ้านแฮด', 'ภูเวียง', 'มัญจาคีรี', 'โคกโพธิ์ไชย', 'หนองเรือ', 'ภูผามาน', 'แวงใหญ่', 'โนนศิลา',
    'เวียงเก่า', 'หนองบัวลำภู', 'หนองบัวแดง', 'โนนสัง', 'วังสามหมอ', 'พล', 'แวงน้อย', 'สีชมพู',
    'ภูผามาน', 'หนองนาคำ', 'บ้านไผ่', 'ชุมแพ', 'สิรินธร', 'น้ำพอง', 'อุบลรัตน์', 'กระนวน'
  ],
  'นครราชสีมา': [
    'เมืองนครราชสีมา', 'โคราช', 'บ้านเหลื่อม', 'จักรสีห์', 'สูงเนิน', 'ขามสะแกแสง', 'โนนไทย',
    'โนนสูง', 'ขามทะเลสอ', 'พระทองคำ', 'ลานกระบือ', 'โคกกรวด', 'บัวใหญ่', 'บัวลาย', 'ประทาย',
    'ปักธงชัย', 'พิมาย', 'ห้วยทอง', 'โชคชัย', 'ด่านขุนทด', 'โนนแดง', 'ขามสะแกแสง', 'บ้านเหลื่อม',
    'จักรสีห์', 'สูงเนิน', 'โนนไทย', 'โนนสูง', 'ขามทะเลสอ', 'พระทองคำ', 'ลานกระบือ', 'โคกกรวด'
  ],
  'สงขลา': [
    'เมืองสงขลา', 'สทิงพระ', 'จะนะ', 'นาทวี', 'เทพา', 'สะบ้าย้อย', 'ระโนด', 'กระแสสินธุ์',
    'รัตภูมิ', 'สะเดา', 'หาดใหญ่', 'นาหม่อม', 'ควนเนียง', 'บางกล่ำ', 'สิงหนคร', 'คลองหอยโข่ง'
  ],
  'ภูเก็ต': [
    'เมืองภูเก็ต', 'กะทู้', 'ถลาง'
  ],
  'ระยอง': [
    'เมืองระยอง', 'บ้านฉาง', 'แกลง', 'วังจันทร์', 'บ้านค่าย', 'ปลวกแดง', 'เขาชายนาม', 'นิคมพัฒนา'
  ],
  'สมุทรสาคร': [
    'เมืองสมุทรสาคร', 'กระทุ่มเบน', 'อำเภอเมือง'
  ],
  'พระนครศรีอยุธยา': [
    'พระนครศรีอยุธยา', 'ท่าเรือ', 'นครหลวง', 'บางไทร', 'บางบาล', 'บางปะอิน', 'บางปะหัน',
    'โพธิ์ไทร', 'ลัดบัวหลวง', 'วังน้อย', 'เสนา', 'บางปะอิน', 'อุทัย', 'มหาราช', 'บ้านพระเอก'
  ]
};

/**
 * Thai subdistricts by province and district (sample data)
 */
export const THAI_SUBDISTRICTS = {
  'กรุงเทพมหานคร': {
    'พระนคร': ['พระบรมมหาราชวงศ์', 'วังบูรพาภิรมย์', 'วัดราชบพิตร', 'สำราญราษฎร์', 'ชนะสงคราม', 'บวรนิเวศ', 'ศิริราช', 'อรุณอมรินทร์', 'วัดกระบือ', 'ช้ากระบือ', 'บ้านบาตร', 'ศรูอาบ', 'สวนจิตรลดา', 'ดุสิต', 'วชิรพายบาล', 'ทุ่งพระ', 'สuanชיטים', 'กิ่งแก้ว', 'ท่าพระ', 'ศักดิ์ไชยสิทธิชัย', 'สีลม', 'สุรวงศ์', 'บางรัก', 'มหาเพ็ชร', 'สีลม', 'สุรวงศ์', 'มหาเพ็ชร', 'สีลม'],
    'ดุสิต': ['ดุสิต', 'วชิรพายบาล', 'สuanชיטים', 'ท่าพระ', 'ศักดิ์ไชยสิทธิชัย', 'กิ่งแก้ว', 'ทุ่งพระ', 'วังบูรพาภิรมย์', 'วัดระฆัง', 'อรุณอมรินทร์'],
    'บางรัก': ['สีลม', 'สุรวงศ์', 'มหาเพ็ชร', 'บางรัก', 'มหาเพ็ชร', 'สีลม', 'สุรวงศ์'],
    'ปทุมวัน': ['ปทุมวัน', 'ลุมพินี', 'วังใหม่', 'สวนหลวง', 'รองเมือง', 'พระโขนง', 'คลองเตย', 'คลองตัน'],
    'วัฒนา': ['คลองเตย', 'คลองตัน', 'พระโขนง', 'ลุมพินี', 'วังใหม่', 'สวนหลวง'],
    'คลองเตย': ['คลองเตย', 'คลองตัน', 'พระโขนง', 'ลุมพินี', 'สวนหลวง'],
    'ห้วยขวาง': ['ห้วยขวาง', 'บางกะปิ', 'สามเสนใน', 'ดินแดง', 'สามเสนใน', 'ดินแดง'],
    'บางกะปิ': ['บางกะปิ', 'ห้วยขวาง', 'สามเสนใน', 'ดินแดง', 'คลองจั่น'],
    'ลาดกระบัง': ['ลาดกระบัง', 'คลองสำเหร่', 'คลองสามประจักษ์', 'ลำปลายมาศ', 'ทับยาว', 'คูบางหลวง'],
    'บางเขน': ['บางเขน', 'อ้อมใหญ่', 'ท่าร้อน', 'ท่าทอง', 'อนุสาวรีย์', 'ลำหาน'],
    'จตุจักร': ['จตุจักร', 'ลาดยาว', 'เสนานิคม', 'จอมพล', 'จักรพงษ์'],
    'หลักสี่': ['หลักสี่', 'ท่าทอง', 'อนุสาวรีย์', 'บางเขน', 'ลำหาน'],
    'บางซื่อ': ['บางซื่อ', 'อ่างทอง', 'วชิรพายบาล', 'ทุ่งสองห้อง', 'บางเขน'],
    'บางแค': ['บางแค', 'บางแคเหนือ', 'บางแคใต้', 'หลักสอง'],
    'บางขุนเทียน': ['ท่าแค', 'บางขุนเทียน', 'บางมด', 'สะทอ'],
    'บางบอน': ['บางบอน', 'ทุ่งครุ', 'บางมด', 'สะทอ'],
    'ทุ่งครุ': ['ทุ่งครุ', 'บางมด', 'สะทอ', 'บางบอน'],
    'สวนหลวง': ['สวนหลวง', 'พระโขนง', 'คลองตัน', 'ลุมพินี', 'สวนหลวง'],
    'คลองสาน': ['คลองสาน', 'สำเภา', 'สมเด็จเจ้าพระยา', 'คลองต้นไม้', 'บางลำภูล่าง'],
    'ยานนาวา': ['ยานนาวา', 'บางโพงพาง', 'ช่องนนทรี', 'บางยอ'],
    'สาทร': ['ทุ่งมหาเมฆ', 'ยานนาวา', 'สาทร', 'คลองเตย'],
    'บางนา': ['บางนาเหนือ', 'บางนาใต้', 'พระโขนง', 'บางแก้ว'],
    'พระโขนง': ['พระโขนง', 'คลองตัน', 'พระโขนงเหนือ', 'พระโขนงใต้'],
    'มีนบุรี': ['มีนบุรี', 'สะพานสูง', 'นวมินทร์', 'สวนจิตรลดา', 'มีนบุรี'],
    'ลาดพร้าว': ['ลาดพร้าว', 'จอมพล', 'จตุจักร', 'เสนานิคม', 'จักรพงษ์'],
    'บึงกุ่ม': ['บึงกุ่ม', 'พระโขนง', 'นวมินทร์', 'สวนจิตรลดา', 'ลาดพร้าว'],
    'วังทองหลาง': ['วังทองหลาง', 'สะพานสูง', 'นวมินทร์', 'คลองจั่น', 'วังทองหลาง'],
    'คลองสามวา': ['คลองสามวา', 'บางชัน', 'ลำปลายมาศ', 'ทับยาว', 'คูบางหลวง'],
    'นวมินทร์': ['นวมินทร์', 'บึงกุ่ม', 'คลองจั่น', 'วังทองหลาง', 'สะพานสูง'],
    'สะพานสูง': ['สะพานสูง', 'ปทุมวัน', 'ประเวศ', 'ลาดพร้าว', 'วังทองหลาง'],
    'ประเวศ': ['ประเวศ', 'คลองสามวา', 'ลำปลายมาศ', 'ทับยาว', 'คูบางหลวง'],
    'ดอนเมือง': ['ดอนเมือง', 'สีกัน', 'บางคุ้ง', 'หลักสอง', 'สนามบิน'],
    'ทวีวัฒนา': ['ทวีวัฒนา', 'ศาลาธรรมสophon', 'ทวีวัฒนา', 'มหาไชย', 'สลาย'],
    'บางขุนเทียน': ['ท่าแค', 'บางขุนเทียน', 'บางมด', 'สะทอ'],
    'ทุ่งครุ': ['ทุ่งครุ', 'บางมด', 'สะทอ', 'บางขุนเทียน'],
    'บางบอน': ['บางบอน', 'บางขุนเทียน', 'ทุ่งครุ', 'บางมด'],
    'สายไหม': ['สายไหม', 'คลองสามวา', 'ลำปลายมาศ', 'ทับยาว', 'คูบางหลวง'],
    'คันนายาว': ['คันนายาว', 'บางชัน', 'ลำปลายมาศ', 'ทับยาว', 'คูบางหลวง'],
    'คลองสามวา': ['คลองสามวา', 'บางชัน', 'ลำปลายมาศ', 'ทับยาว', 'คูบางหลวง'],
    'บางขุนเทียน': ['ท่าแค', 'บางขุนเทียน', 'บางมด', 'สะทอ'],
    'ทุ่งครุ': ['ทุ่งครุ', 'บางมด', 'สะทอ', 'บางขุนเทียน'],
    'บางบอน': ['บางบอน', 'บางขุนเทียน', 'ทุ่งครุ', 'บางมด']
  },
  'สมุทรปราการ': {
    'เมืองสมุทรปราการ': ['ปากน้ำ', 'ท้ายกีบ', 'บางเมือง', 'บางปู', 'บางปูใหม่', 'พระสมุทรเจดีย์'],
    'บางบ่อ': ['บางบ่อ', 'คลองด่าน', 'บางพลี', 'บางเสาธง'],
    'บางพลี': ['บางพลีใหญ่', 'บางพลี', 'ราชาเทวะ', 'หนองปรือ', 'บางเสาธง'],
    'พระประแดง': ['พระประแดง', 'ตลาด', 'บางโปรง', 'บางน้ำผึ้ง', 'บางกระสอ', 'บางหัวเสือ'],
    'พระสมุทรเจดีย์': ['พระสมุทรเจดีย์', 'ลาเอก', 'นาคลองบางปลากด', 'บางขอ'],
    'บางเสาธง': ['บางเสาธง', 'บางพลี', 'บางบ่อ', 'บางพลีใหญ่']
  },
  'นนทบุรี': {
    'เมืองนนทบุรี': ['สุขเนื่อง', 'บางกร่าง', 'บางเขน', 'ท่าทราย', 'ไทรน้อย', 'บางใหญ่'],
    'บางกรวย': ['บางกรวย', 'บางขุนกอง', 'บางขุนศรี', 'วัดชลอ', 'พลอยพระอินทร์'],
    'บางใหญ่': ['บางใหญ่', 'บางม่วง', 'บางเลน', 'ไทรน้อย', 'บางกรวย'],
    'บางบัวทอง': ['บางบัวทอง', 'โพธิ์ทอง', 'สลाया', 'บางกรวย', 'ไทรน้อย'],
    'ไทรน้อย': ['ไทรน้อย', 'บางใหญ่', 'บางบัวทอง', 'บางกรวย', 'ไทรน้อย'],
    'ปากเกร็ด': ['ปากเกร็ด', 'บางม่วง', 'บางกรวย', 'ไทรน้อย', 'บางใหญ่']
  },
  'ปทุมธานี': {
    'เมืองปทุมธานี': ['บางกระบือ', 'บางพูด', 'บางหลวง', 'บ้านใหม่', 'คลองหนึ่ง', 'คลองสอง', 'คลองสาม', 'คลองสี่', 'คลองห้า', 'คลองหก', 'คลองเจ็ด', 'บางกระบือ', 'บางพูด'],
    'คลองหลวง': ['คลองหนึ่ง', 'คลองสอง', 'คลองสาม', 'คลองสี่', 'คลองห้า', 'คลองหก', 'คลองเจ็ด', 'บางกระบือ', 'บางพูด'],
    'ธัญบุรี': ['บัวหลวง', 'บัวใหญ่', 'ลำลูกกา', 'รังสิทธิ์', 'ปากเคล็ด', 'บัวหลวง'],
    'หนองเสือ': ['หนองเสือ', 'บัวหลวง', 'บัวใหญ่', 'ลำลูกกา', 'รังสิทธิ์'],
    'ลาดหลุมแก้ว': ['ลาดหลุมแก้ว', 'บัวหลวง', 'บัวใหญ่', 'ลำลูกกา', 'รังสิทธิ์'],
    'สำโรง': ['สำโรง', 'บัวหลวง', 'บัวใหญ่', 'ลำลูกกา', 'รังสิทธิ์']
  },
  'ชลบุรี': {
    'เมืองชลบุรี': ['หนองใหญ่', 'บ้านข่า', 'บ้านสุ언을', 'ห้วยกะปิ', 'สำเภา', 'หนองมะค่า', 'บางพระ', 'ทุ่งสุขลา', 'หนองรี', 'มาบกา'],
    'บ้านบึง': ['บ้านบึง', 'หนองไผ่', 'หนองใหญ่', 'บ้านสุ언을', 'หนองมะค่า'],
    'หนองใหญ่': ['หนองใหญ่', 'บ้านบึง', 'บ้านสุ언을', 'หนองมะค่า', 'มาบกา'],
    'บางละมุง': ['หนองปรือ', 'หนองหอย', 'บางละมุง', 'ห้วยใหญ่', 'หนองขาม', 'หนองพลับ', 'เนินพระ', 'เขาไม้แก้ว', 'บ้านอัมพุ'],
    'พานทอง': ['พานทอง', 'หนองใหญ่', 'มาบกา', 'หนองรี', 'ห้วยกะปิ'],
    'โพธิ์พระยา': ['โพธิ์พระยา', 'บ้านบึง', 'หนองใหญ่', 'มาบกา', 'หนองรี'],
    'ศรีราชา': ['ศรีราชา', 'สุรสากร', 'บางพระ', 'ทุ่งสุขลา', 'บ้านข่า', 'บ้านสุ언을', 'ห้วยกะปิ', 'หนองมะค่า'],
    'เกาะสีชัง': ['เกาะสีชัง', 'ท่าทอง', 'บ้านข่า', 'ห้วยกะปิ', 'หนองมะค่า'],
    'สัตหีบ': ['สัตหีบ', 'บางละมุง', 'หนองปรือ', 'หนองหอย', 'ห้วยใหญ่'],
    'บ่อทอง': ['บ่อทอง', 'บ้านบึง', 'หนองใหญ่', 'มาบกา', 'หนองรี'],
    'เกาะจันทร์': ['เกาะจันทร์', 'ท่าทอง', 'บ้านข่า', 'ห้วยกะปิ', 'หนองมะค่า']
  },
  'เชียงใหม่': {
    'เมืองเชียงใหม่': ['ศรีภูมิ', 'ช้างม่อม', 'ช้างเผือก', 'หัวเวียง', 'ป่าแดด', 'หนองหอย', 'แก้วนวล', 'มหาวน', 'ท่าศาลา', 'ช้างม่อม', 'ช้างเผือก'],
    'แม่ออน': ['แม่ออน', 'แม่อาย', 'เชียงdao', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง', 'ฮอด'],
    'เชียงdao': ['เชียงdao', 'แม่ออน', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง', 'ฮอด'],
    'แม่แจ่ม': ['แม่แจ่ม', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง', 'ฮอด'],
    'แม่ริม': ['แม่ริม', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง', 'ฮอด'],
    'สะเมิง': ['สะเมิง', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'แม่ต่าง', 'แม่แวง', 'ฮอด'],
    'แม่ต่าง': ['แม่ต่าง', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่แวง', 'ฮอด'],
    'แม่แวง': ['แม่แวง', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'ฮอด'],
    'ฮอด': ['ฮอด', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'สันกำแพง': ['สันกำแพง', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'สันป่าตอง': ['สันป่าตอง', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'สันไก่': ['สันไก่', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'หางดง': ['หางดง', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'ฮอด': ['ฮอด', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'ชัยปรากร': ['ชัยปรากร', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'เวียงแหง': ['เวียงแหง', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'อมก๋อย': ['อมก๋อย', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'ดอยเต่า': ['ดอยเต่า', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'ดอยสะเก็ด': ['ดอยสะเก็ด', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'แม่วาง': ['แม่วาง', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'เวียงหนองหลง': ['เวียงหนองหลง', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง'],
    'ดอยหล่อ': ['ดอยหล่อ', 'แม่ออน', 'เชียงdao', 'แม่อาย', 'แม่แจ่ม', 'แม่ริม', 'สะเมิง', 'แม่ต่าง', 'แม่แวง']
  }
};

/**
 * Vehicle types for categories
 */
export const VEHICLE_TYPES = [
  { id: 'car', name: 'รถยนต์', icon: 'car' },
  { id: 'motorcycle', name: 'รถจักรยานยนต์', icon: 'motorcycle' },
  { id: 'truck', name: 'รถบรรทุก', icon: 'truck' },
  { id: 'van', name: 'รถตู้/วาน', icon: 'van' },
  { id: 'tractor', name: 'รถแทรกเตอร์', icon: 'tractor' },
  { id: 'other', name: 'อื่นๆ', icon: 'other' }
];

/**
 * Service types for categories
 */
export const SERVICE_TYPES = [
  { id: 'repair', name: 'ซ่อมบำรุง', icon: 'repair' },
  { id: 'maintenance', name: 'บำรุงรักษา', icon: 'maintenance' },
  { id: 'transport', name: 'ขนส่ง/ลากรถ', icon: 'transport' },
  { id: 'towing', name: 'ลากรถช้า/รถยก', icon: 'towing' },
  { id: 'inspection', name: 'ตรวจสภาพ/ดูแล', icon: 'inspection' },
  { id: 'tire', name: 'เปลี่ยนยาง/ปรับอัดลม', icon: 'tire' },
  { id: 'battery', name: 'แบตเตอรี่/ระบบไฟฟ้า', icon: 'battery' },
  { id: 'ac', name: 'ระบบปรับอากาศ', icon: 'ac' },
  { id: 'body', name: 'งานสี/งานตัวรถ', icon: 'body' },
  { id: 'other', name: 'บริการอื่นๆ', icon: 'other' }
];

/**
 * Urgency levels
 */
export const URGENCY_LEVELS = [
  { id: 'normal', name: 'ปกติ', color: 'var(--color-info)' },
  { id: 'urgent', name: 'ด่วน', color: 'var(--color-warning)' },
  { id: 'emergency', name: 'ฉุกเฉิน', color: 'var(--color-danger)' }
];

/**
 * Post statuses
 */
export const POST_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

/**
 * Bid statuses
 */
export const BID_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn'
};

/**
 * Show toast notification
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container') || createToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast alert alert-${type}`;
  toast.innerHTML = `
    <div class="alert-content">
      <div class="alert-message">${message}</div>
    </div>
    <button class="alert-dismiss" aria-label="ปิด">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  toast.querySelector('.alert-dismiss').addEventListener('click', () => {
    removeToast(toast);
  });

  container.appendChild(toast);

  setTimeout(() => removeToast(toast), duration);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function removeToast(toast) {
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => toast.remove());
}

/**
 * Show modal
 */
export function showModal(content, options = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h3 class="modal-title" id="modal-title">${options.title || ''}</h3>
        <button class="modal-close" aria-label="ปิด">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">${content}</div>
      ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
    </div>
  `;

  document.body.appendChild(overlay);

  // Force reflow then open
  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => {
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  return { close, overlay };
}

/**
 * Confirm dialog
 */
export function confirmDialog(message, options = {}) {
  return new Promise((resolve) => {
    const footer = `
      <button class="btn btn-ghost" data-result="false">${options.cancelText || 'ยกเลิก'}</button>
      <button class="btn btn-${options.danger ? 'danger' : 'primary'}" data-result="true">${options.confirmText || 'ยืนยัน'}</button>
    `;

    const { overlay, close } = showModal(`<p>${message}</p>`, { title: options.title, footer });

    overlay.querySelectorAll('[data-result]').forEach(btn => {
      btn.addEventListener('click', () => {
        close();
        resolve(btn.dataset.result === 'true');
      });
    });
  });
}

/**
 * Debounce function
 */
export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Generate unique ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Sanitize HTML (basic)
 */
export function sanitizeHtml(html) {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}