-- Shared product catalog: a global reference of common food-service items and their
-- STANDARD pack/units (no price, price varies by camp/vendor/week; units don't). Every
-- camp reads it; adding an inventory item can autofill name/category/unit/pack from it.
-- Not camp-scoped, so it lives outside the per-camp RLS pattern: any authenticated user
-- can read, and any can contribute (it grows via CSV import).

CREATE TABLE IF NOT EXISTS product_catalog (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  category           text NOT NULL DEFAULT 'other',
  dimension          text NOT NULL DEFAULT 'count',      -- count | weight | volume
  stock_unit         text NOT NULL DEFAULT 'each',
  stock_unit_in_base numeric NOT NULL DEFAULT 1,
  pack_unit          text,                               -- e.g. 'case', 'bag'
  pack_size          numeric,                            -- stock units per pack
  allergens          text[] NOT NULL DEFAULT '{}',
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_product_catalog_updated_at BEFORE UPDATE ON product_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS product_catalog_name_idx ON product_catalog (lower(name));

CREATE POLICY "auth_select_product_catalog" ON product_catalog FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_manage_product_catalog" ON product_catalog FOR ALL
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── Curated seed: common camp-kitchen items + standard food-service packs ──
INSERT INTO product_catalog (name, category, dimension, stock_unit, stock_unit_in_base, pack_unit, pack_size, allergens) VALUES
-- Protein
('Chicken Breast Boneless','protein','weight','lb',16,'case',40,'{}'),
('Chicken Thighs Boneless','protein','weight','lb',16,'case',40,'{}'),
('Chicken Drumsticks','protein','weight','lb',16,'case',40,'{}'),
('Whole Chicken','protein','weight','lb',16,'case',40,'{}'),
('Ground Beef 80/20','protein','weight','lb',16,'case',40,'{}'),
('Beef Hamburger Patties','protein','weight','lb',16,'case',30,'{}'),
('Beef Hot Dogs','protein','weight','lb',16,'case',10,'{}'),
('Sliced Deli Turkey','protein','weight','lb',16,'case',20,'{}'),
('Sliced Deli Ham','protein','weight','lb',16,'case',20,'{}'),
('Bacon','protein','weight','lb',16,'case',15,'{}'),
('Pork Sausage Links','protein','weight','lb',16,'case',10,'{}'),
('Italian Sausage','protein','weight','lb',16,'case',10,'{}'),
('Meatballs','protein','weight','lb',16,'case',10,'{gluten}'),
('Ground Turkey','protein','weight','lb',16,'case',40,'{}'),
('Tilapia Fillet','protein','weight','lb',16,'case',10,'{fish}'),
('Salmon Fillet','protein','weight','lb',16,'case',10,'{fish}'),
('Breaded Fish Sticks','protein','weight','lb',16,'case',10,'{fish,gluten}'),
('Popcorn Shrimp','protein','weight','lb',16,'case',10,'{shellfish,gluten}'),
('Firm Tofu','protein','weight','lb',16,'case',12,'{soy}'),
('Pepperoni','protein','weight','lb',16,'case',10,'{}'),
-- Dairy
('Whole Milk','dairy','volume','gallon',128,'case',4,'{dairy}'),
('2% Milk','dairy','volume','gallon',128,'case',4,'{dairy}'),
('Chocolate Milk','dairy','volume','gallon',128,'case',4,'{dairy}'),
('Heavy Cream','dairy','volume','quart',32,'case',12,'{dairy}'),
('Shredded Mozzarella','dairy','weight','lb',16,'case',30,'{dairy}'),
('Shredded Cheddar','dairy','weight','lb',16,'case',20,'{dairy}'),
('American Cheese Slices','dairy','weight','lb',16,'case',20,'{dairy}'),
('Cream Cheese','dairy','weight','lb',16,'case',10,'{dairy}'),
('Butter','dairy','weight','lb',16,'case',30,'{dairy}'),
('Sour Cream','dairy','weight','lb',16,'tub',5,'{dairy}'),
('Yogurt Cups','dairy','count','each',1,'case',48,'{dairy}'),
('Large Eggs','dairy','count','dozen',12,'case',15,'{egg}'),
('Grated Parmesan','dairy','weight','lb',16,'case',8,'{dairy}'),
('Cottage Cheese','dairy','weight','lb',16,'case',6,'{dairy}'),
-- Produce
('Iceberg Lettuce','produce','count','head',1,'case',24,'{}'),
('Romaine Lettuce','produce','count','head',1,'case',24,'{}'),
('Roma Tomatoes','produce','weight','lb',16,'case',25,'{}'),
('Yellow Onions','produce','weight','lb',16,'bag',50,'{}'),
('Russet Potatoes','produce','weight','lb',16,'bag',50,'{}'),
('Carrots','produce','weight','lb',16,'bag',25,'{}'),
('Celery','produce','count','bunch',1,'case',24,'{}'),
('Broccoli Crowns','produce','weight','lb',16,'case',20,'{}'),
('Green Bell Peppers','produce','count','each',1,'case',40,'{}'),
('Cucumbers','produce','count','each',1,'case',40,'{}'),
('Gala Apples','produce','weight','lb',16,'case',40,'{}'),
('Oranges','produce','weight','lb',16,'case',40,'{}'),
('Bananas','produce','weight','lb',16,'case',40,'{}'),
('Strawberries','produce','weight','lb',16,'flat',8,'{}'),
('Grapes','produce','weight','lb',16,'case',18,'{}'),
('Baby Spinach','produce','weight','lb',16,'case',4,'{}'),
('Garlic','produce','weight','lb',16,'case',5,'{}'),
('Mushrooms','produce','weight','lb',16,'case',10,'{}'),
('Watermelon','produce','count','each',1,'case',5,'{}'),
-- Dry goods
('White Sandwich Bread','dry_goods','count','loaf',1,'case',12,'{gluten}'),
('Wheat Bread','dry_goods','count','loaf',1,'case',12,'{gluten}'),
('Hamburger Buns','dry_goods','count','dozen',12,'case',8,'{gluten}'),
('Hot Dog Buns','dry_goods','count','dozen',12,'case',8,'{gluten}'),
('Spaghetti','dry_goods','weight','lb',16,'case',20,'{gluten}'),
('Penne Pasta','dry_goods','weight','lb',16,'case',20,'{gluten}'),
('Elbow Macaroni','dry_goods','weight','lb',16,'case',20,'{gluten}'),
('Long Grain White Rice','dry_goods','weight','lb',16,'bag',25,'{}'),
('All-Purpose Flour','dry_goods','weight','lb',16,'bag',25,'{gluten}'),
('Granulated Sugar','dry_goods','weight','lb',16,'bag',25,'{}'),
('Brown Sugar','dry_goods','weight','lb',16,'bag',25,'{}'),
('Rolled Oats','dry_goods','weight','lb',16,'case',12,'{gluten}'),
('Pancake Mix','dry_goods','weight','lb',16,'case',25,'{gluten,dairy,egg}'),
('Flour Tortillas','dry_goods','count','dozen',12,'case',12,'{gluten}'),
('Corn Tortillas','dry_goods','count','dozen',12,'case',12,'{}'),
('Breadcrumbs','dry_goods','weight','lb',16,'case',6,'{gluten}'),
('Cornmeal','dry_goods','weight','lb',16,'bag',25,'{}'),
('Assorted Cereal Bowls','dry_goods','count','each',1,'case',96,'{gluten}'),
('Croutons','dry_goods','weight','lb',16,'case',8,'{gluten}'),
-- Pantry / canned
('Marinara Sauce','pantry','count','can',1,'case',6,'{}'),
('Diced Tomatoes','pantry','count','can',1,'case',6,'{}'),
('Tomato Paste','pantry','count','can',1,'case',6,'{}'),
('Canned Corn','pantry','count','can',1,'case',6,'{}'),
('Canned Green Beans','pantry','count','can',1,'case',6,'{}'),
('Canned Black Beans','pantry','count','can',1,'case',6,'{}'),
('Ketchup','pantry','volume','gallon',128,'case',4,'{}'),
('Yellow Mustard','pantry','volume','gallon',128,'case',4,'{}'),
('Mayonnaise','pantry','volume','gallon',128,'case',4,'{egg}'),
('Ranch Dressing','pantry','volume','gallon',128,'case',4,'{egg,dairy}'),
('Canola Oil','pantry','volume','gallon',128,'case',6,'{}'),
('Olive Oil','pantry','volume','gallon',128,'case',6,'{}'),
('Peanut Butter','pantry','weight','lb',16,'case',6,'{peanut}'),
('Grape Jelly','pantry','weight','lb',16,'case',6,'{}'),
('Honey','pantry','weight','lb',16,'case',6,'{}'),
('Maple Syrup','pantry','volume','gallon',128,'case',4,'{}'),
('Soy Sauce','pantry','volume','gallon',128,'case',4,'{soy,gluten}'),
('Salsa','pantry','count','can',1,'case',6,'{}'),
('Chicken Broth','pantry','count','can',1,'case',12,'{}'),
('Hot Sauce','pantry','count','bottle',1,'case',12,'{}'),
('Table Salt','pantry','weight','lb',16,'case',24,'{}'),
('Black Pepper','pantry','weight','lb',16,'case',6,'{}'),
-- Frozen
('French Fries','frozen','weight','lb',16,'case',30,'{}'),
('Tater Tots','frozen','weight','lb',16,'case',30,'{}'),
('Frozen Broccoli','frozen','weight','lb',16,'case',20,'{}'),
('Frozen Mixed Vegetables','frozen','weight','lb',16,'case',20,'{}'),
('Frozen Corn','frozen','weight','lb',16,'case',20,'{}'),
('Frozen Peas','frozen','weight','lb',16,'case',20,'{}'),
('Chicken Nuggets','frozen','weight','lb',16,'case',30,'{gluten}'),
('Corn Dogs','frozen','count','each',1,'case',72,'{gluten}'),
('Frozen Waffles','frozen','count','each',1,'case',144,'{gluten,egg,dairy}'),
('Cheese Pizza','frozen','count','each',1,'case',12,'{gluten,dairy}'),
('Ice Cream Cups','frozen','count','each',1,'case',96,'{dairy}'),
('Frozen Strawberries','frozen','weight','lb',16,'case',10,'{}'),
-- Beverage
('Orange Juice','beverage','volume','gallon',128,'case',4,'{}'),
('Apple Juice','beverage','volume','gallon',128,'case',4,'{}'),
('Lemonade Mix','beverage','weight','lb',16,'case',12,'{}'),
('Bottled Water','beverage','count','each',1,'case',24,'{}'),
('Fruit Punch Mix','beverage','weight','lb',16,'case',12,'{}'),
('Ground Coffee','beverage','weight','lb',16,'case',6,'{}'),
('Hot Chocolate Mix','beverage','weight','lb',16,'case',12,'{dairy}'),
-- Snacks
('Goldfish Crackers','snacks','count','each',1,'case',45,'{gluten,dairy}'),
('Pretzels','snacks','weight','lb',16,'case',10,'{gluten}'),
('Granola Bars','snacks','count','each',1,'case',120,'{gluten,soy}'),
('Potato Chips','snacks','count','each',1,'case',104,'{}'),
('Graham Crackers','snacks','weight','lb',16,'case',12,'{gluten}'),
('Marshmallows','snacks','weight','lb',16,'case',12,'{}'),
('Chocolate Bars','snacks','count','each',1,'case',36,'{dairy,soy}'),
('Assorted Cookies','snacks','count','each',1,'case',120,'{gluten,dairy,egg}'),
('Popcorn Kernels','snacks','weight','lb',16,'case',12,'{}'),
('Fruit Snacks','snacks','count','each',1,'case',96,'{}'),
('Peanut Butter Crackers','snacks','count','each',1,'case',60,'{peanut,gluten}'),
('Raisins','snacks','count','each',1,'case',144,'{}');
