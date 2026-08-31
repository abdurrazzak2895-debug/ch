-- Seed test_centers with all 20 centers from t2hub (all divisions)
-- Verified live on 2026-08-30

INSERT INTO public.test_centers (site_id, name, city, country_code) VALUES
  (45, 'Bangladesh German TTC', 'Dhaka', '+880'),
  (102, 'Tangail Technical Training Center', 'Tangail', '+880'),
  (115, 'BRTC Central Training Institute', 'Gazipur', '+880'),
  (220, 'Kishoreganj Technical Training Centre', 'Kishoreganj', '+880'),
  (221, 'Shariatpur Technical Training Centre', 'Shariatpur', '+880'),
  (403, 'Arkan Al-Taameer for professional classification - Dhaka', 'Dhaka', '+880'),
  (296, 'Ramu Technical Training Centre', 'Coxs Bazar', '+880'),
  (54, 'Rajshahi Technical Training Centre', 'Rajshahi', '+880'),
  (107, 'Bogura Technical Training Centre', 'Bogura', '+880'),
  (168, 'Chapainawabganj Technical Training Centre', 'Chapainawabganj', '+880'),
  (201, 'Pabna Technical Training Centre', 'Pabna', '+880'),
  (265, 'Joypurhat Technical Training Center', 'Joypurhat', '+880'),
  (156, 'Khulna Technical Training Centre', 'Khulna', '+880'),
  (171, 'Jashore Technical Training Centre', 'Jashore', '+880'),
  (181, 'Narail Technical Training Centre', 'Narail', '+880'),
  (166, 'Faridpur Technical Training Centre', 'Faridpur', '+880'),
  (180, 'Madaripur Technical Training Centre', 'Madaripur', '+880'),
  (240, 'Patuakhali Technical Training Centre', 'Patuakhali', '+880'),
  (70, 'Mymensingh Technical Training Centre', 'Mymensingh', '+880'),
  (71, 'Sylhet Technical Training Center', 'Sylhet', '+880')
ON CONFLICT (site_id) DO UPDATE SET
  name = EXCLUDED.name,
  city = EXCLUDED.city;
