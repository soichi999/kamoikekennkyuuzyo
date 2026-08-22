import pandas as pd, numpy as np, geopandas as gpd
from shapely.geometry import Point
from scipy.spatial import cKDTree
import statsmodels.api as sm

WARDS=['千代田区','中央区','港区','新宿区','文京区','台東区','墨田区','江東区','品川区','目黒区','大田区','世田谷区','渋谷区','中野区','杉並区','豊島区','北区','荒川区','板橋区','練馬区','足立区','葛飾区','江戸川区']
ward_codes=['13101','13102','13103','13104','13105','13106','13107','13108','13109','13110','13111','13112','13113','13114','13115','13116','13117','13118','13119','13120','13121','13122','13123']

# 1. 人口
df=pd.read_csv('apps/data/raw/人口.csv', encoding='cp932', skiprows=4)
sub=df[(df['男女']=='総数')&(df['地域階層レベル']==4)&(df['市区町村コード'].astype(str).isin(ward_codes))].copy()
print('抽出',len(sub))
def parse_child(x):
    s=str(x).strip()
    if s=='X': return np.nan
    if s=='-': return 0
    try: return float(s)
    except: return np.nan
sub['child_pop']=sub['（再掲）15歳未満'].apply(parse_child)
sub['KEY_CODE']=sub['市区町村コード'].astype(str)+sub['町丁字コード'].astype(str).str.zfill(4)
# 除外
print('X',sub['child_pop'].isna().sum(),'child==0',(sub['child_pop']==0).sum())
sub2=sub[sub['child_pop']>0].copy()
print('残り',len(sub2), '除外',len(sub)-len(sub2))
sub2.to_csv('/tmp/pop_filtered.csv',index=False)

# 2. shp
gdf=gpd.read_file('apps/data/raw/東京都人口/r2ka13.shp', encoding='cp932')
gdf['KEY_CODE']=gdf['KEY_CODE'].astype(str)
# 23区
g23=gdf[gdf['CITY_NAME'].isin(WARDS)].copy()
# 面積とX/Y
g23['area_km2']=g23.geometry.area/1e6
# join
merged=sub2.merge(g23[['KEY_CODE','CITY_NAME','S_NAME','X_CODE','Y_CODE','JINKO','geometry','area_km2']], on='KEY_CODE', how='inner')
print('merged',len(merged), 'pop',len(sub2),'g23',len(g23))
# 代表点: X_CODE/Y_CODEをPointに
# X_CODE=lon, Y_CODE=lat
merged['lon']=pd.to_numeric(merged['X_CODE'],errors='coerce')
merged['lat']=pd.to_numeric(merged['Y_CODE'],errors='coerce')
# geometry for distance: create GeoDataFrame from lon/lat
pts=gpd.GeoDataFrame(merged, geometry=gpd.points_from_xy(merged['lon'], merged['lat']), crs='EPSG:4326').to_crs('EPSG:2451')
# keep
merged_gdf=pts
merged_gdf['pop_density']=merged_gdf['JINKO']/merged_gdf['area_km2']

# 3. 施設
def load_pts(path):
    d=pd.read_csv(path)
    d=d[d['lon'].notna() & d['lat'].notna()]
    g=gpd.GeoDataFrame(d, geometry=gpd.points_from_xy(d['lon'], d['lat']), crs='EPSG:4326').to_crs('EPSG:2451')
    return g
koban=load_pts('apps/data/processed/koban_geocoded.csv')
school=load_pts('apps/data/processed/school_geocoded.csv')
conveni=pd.read_csv('apps/data/processed/conveni_osm.csv')
conveni=conveni[conveni['lon'].notna()]
conveni_g=gpd.GeoDataFrame(conveni, geometry=gpd.points_from_xy(conveni['lon'], conveni['lat']), crs='EPSG:4326').to_crs('EPSG:2451')
# station
st=gpd.read_file('apps/data/raw/statoin/S12-18_NumberOfPassengers.shp', encoding='cp932')
st['S12_033_num']=pd.to_numeric(st['S12_033'], errors='coerce')
# filter to 23区 valid
# use union method
r23_6668=g23.to_crs('EPSG:6668')
union=r23_6668.geometry.union_all()
# st is EPSG:6668 already
mask=st.geometry.centroid.intersects(union) | st.geometry.intersects(union)
st23=st[mask].copy()
st23=st23[st23['S12_033_num'].gt(0) & st23['S12_033_num'].notna()]
print('st valid 23区',len(st23))
st23_cent=gpd.GeoDataFrame(st23, geometry=st23.geometry.centroid, crs='EPSG:6668').to_crs('EPSG:2451')

# distances
def nearest_dist(pts_gdf, target_gdf):
    tree=cKDTree(np.array([[p.x,p.y] for p in target_gdf.geometry]))
    dists,_=tree.query(np.array([[p.x,p.y] for p in pts_gdf.geometry]), k=1)
    return dists
merged_gdf['dist_koban']=nearest_dist(merged_gdf, koban)
merged_gdf['dist_school']=nearest_dist(merged_gdf, school)
print('dist stats koban',merged_gdf['dist_koban'].describe().to_string())
print('dist school',merged_gdf['dist_school'].describe().to_string())

# conveni density: count within polygon
# need polygon geometry from original g23 (EPSG:2451)
# merged_gdf currently has point geometry (centroid), need polygon geometry for sjoin
# get polygon geometry via join
poly_map=g23.set_index('KEY_CODE')['geometry'].to_dict()
merged_gdf['poly_geom']=merged_gdf['KEY_CODE'].map(poly_map)
poly_gdf=gpd.GeoDataFrame(merged_gdf, geometry='poly_geom', crs='EPSG:2451')
# sjoin conveni within poly
joined=gpd.sjoin(conveni_g, poly_gdf, how='inner', predicate='within')
cnt=joined.groupby('index_right').size()
merged_gdf['conveni_n']=cnt.reindex(merged_gdf.index, fill_value=0).values
merged_gdf['conveni_density']=merged_gdf['conveni_n']/merged_gdf['area_km2']

# station_flow
# for each merged point, sum passenger*exp(-dist/800)
# brute force: 2822*589 ~1.66M
st_coords=np.array([[p.x,p.y] for p in st23_cent.geometry])
st_pass=st23_cent['S12_033_num'].values
pts_coords=np.array([[p.x,p.y] for p in merged_gdf.geometry])
# vectorized per chunk to avoid memory
flows=[]
for i in range(len(pts_coords)):
    dx=pts_coords[i,0]-st_coords[:,0]
    dy=pts_coords[i,1]-st_coords[:,1]
    d=np.sqrt(dx*dx+dy*dy)
    w=np.exp(-d/800)
    flow=np.sum(st_pass*w)
    flows.append(flow)
    if i%500==0: print(f'station_flow {i}/{len(pts_coords)}')
merged_gdf['station_flow']=np.array(flows)
print('station_flow describe', merged_gdf['station_flow'].describe().to_string())

# incidents: from phase3_summary or crime
# Use phase3_summary.csv incidents (via KEY_CODE)
try:
    summ=pd.read_csv('apps/data/processed/phase3_summary.csv')
    # summ KEY_CODE is 11-digit?
    summ['KEY_CODE']=summ['KEY_CODE'].astype(str)
    inc_map=summ.set_index('KEY_CODE')['incidents'].to_dict()
    merged_gdf['incidents']=merged_gdf['KEY_CODE'].map(inc_map).fillna(0).astype(int)
except Exception as e:
    print('incidents map fail',e)
    merged_gdf['incidents']=0
print('incidents sum',merged_gdf['incidents'].sum(), 'mean',merged_gdf['incidents'].mean())

# 4. モデル
# 学習: 荒川区除外?  Phase 4は22区学習。ここも同様
train=merged_gdf[merged_gdf['CITY_NAME']!='荒川区'].copy()
test=merged_gdf[merged_gdf['CITY_NAME']=='荒川区'].copy()
print('train',len(train),'test',len(test))
# log transforms
train['log_station_flow']=np.log(train['station_flow']+1)
train['log_conveni_density']=np.log(train['conveni_density']+1)
train['log_pop_density']=np.log(train['pop_density'])
train['log_dist_koban']=np.log(np.clip(train['dist_koban'],1,None))
train['log_dist_school']=np.log(np.clip(train['dist_school'],1,None))
# ward dummies
ward_dummies=pd.get_dummies(train['CITY_NAME'], prefix='ward', drop_first=True).astype(int)
X=pd.concat([train[['log_station_flow','log_conveni_density','log_pop_density','log_dist_koban','log_dist_school']], ward_dummies], axis=1)
X=sm.add_constant(X)
offset=np.log(train['child_pop'])
model=sm.GLM(train['incidents'], X, family=sm.families.Poisson(), offset=offset)
res=model.fit()
print(res.summary())
coef=pd.DataFrame({'coef':res.params,'std_err':res.bse,'z':res.tvalues,'p':res.pvalues})
print(coef.to_string())
print('AIC',res.aic,'llf',res.llf)
# dist_koban sign
print('dist_koban coef',res.params['log_dist_koban'], 'p',res.pvalues['log_dist_koban'])
# correlation station_flow vs conveni_density
corr=np.corrcoef(train['station_flow'], train['conveni_density'])[0,1]
print('corr station_flow vs conveni_density',corr)
# also log versions
corr_log=np.corrcoef(train['log_station_flow'], train['log_conveni_density'])[0,1]
print('corr log',corr_log)
coef.to_csv('apps/data/processed/phase4_child_station_coefficients.csv')
merged_gdf.to_csv('apps/data/processed/phase4_child_station_merged.csv', index=False)
print('done')
