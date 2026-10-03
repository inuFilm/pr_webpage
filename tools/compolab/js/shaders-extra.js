export const EXTRA_SHADERS={
 render3d:`uniform sampler2D u_img;uniform int u_space;void main(){vec4 c=at(u_img,v_uv);outColor=u_space==1?vec4(l2s(unpremul(c).rgb)*c.a,c.a):c;}`,
 depthDof:`uniform sampler2D u_img,u_other,u_depth;uniform float u_distance,u_range;void main(){vec4 c=at(u_img,v_uv),b=at(u_other,v_uv);float z=at(u_depth,v_uv).r;outColor=mix(c,b,clamp(abs(z-u_distance)/max(.01,u_range),0.,1.));}`,
 depthFog:`uniform sampler2D u_img,u_depth;uniform vec3 u_color;uniform int u_space;uniform float u_near,u_far,u_density,u_smoke,u_seed;void main(){vec4 c=at(u_img,v_uv);float z=at(u_depth,v_uv).r,d=smoothstep(u_near,max(u_near+.001,u_far),z)*u_density*mix(1.,fbm(v_uv*8.+u_seed),u_smoke);outColor=vec4(mix(c.rgb,(u_space==1?l2s(u_color):u_color)*c.a,d),c.a);}`,
 rimlight:`uniform sampler2D u_img,u_normal;uniform vec3 u_color;uniform float u_intensity,u_power;void main(){vec4 c=at(u_img,v_uv);vec3 n=at(u_normal,v_uv).rgb*2.-1.;float edge=pow(1.-clamp(abs(n.z),0.,1.),u_power);outColor=vec4(c.rgb+u_color*edge*u_intensity*c.a,c.a);}`,
 idMask:`uniform sampler2D u_img;uniform float u_id;uniform bool u_invert;void main(){vec4 c=at(u_img,v_uv);float a=abs(c.r*255.-u_id)<.4&&c.a>.5?1.:0.;if(u_invert)a=1.-a;outColor=vec4(a);}`,
 passPreview:`uniform sampler2D u_img;uniform int u_kind;uniform float u_far;void main(){vec4 c=at(u_img,v_uv);if(u_kind==0)c.rgb=vec3(c.r/u_far);if(u_kind==2){float id=floor(c.r*255.+.5);c.rgb=vec3(hash(vec2(id,1)),hash(vec2(id,2)),hash(vec2(id,3)))*c.a;}outColor=c;}`,
 tlightSeed:`uniform sampler2D u_img,u_shape;uniform int u_kind;
 void main(){float a=at(u_shape,v_uv).a;float s=u_kind==0?1.-a:u_kind==1?max(0.,lum(at(u_img,v_uv).rgb)):a;outColor=vec4(s);}`,
 tlight:`uniform sampler2D u_img,u_other,u_shape;uniform float u_intensity,u_spill;uniform vec3 u_color;
 void main(){vec4 c=at(u_img,v_uv);float a=at(u_shape,v_uv).a,b=at(u_other,v_uv).r;float light=b*((1.-a)+u_spill*a*(1.-b))*u_intensity;vec3 add=max(vec3(0),u_color*light);outColor=vec4(c.rgb+add,max(c.a,clamp(max(max(add.r,add.g),add.b),0.,1.)));}`,
 flare:`uniform sampler2D u_img;uniform float u_x,u_y,u_intensity,u_ghosts,u_spacing,u_halo;uniform vec3 u_color;
 void main(){vec2 aspect=vec2(u_res.x/u_res.y,1.),q=(v_uv-.5)*aspect,p=(vec2(u_x,u_y)-.5)*aspect;vec3 light=vec3(0);
 for(int k=0;k<12;k++){if(float(k)>=u_ghosts)break;vec2 center=-p*u_spacing*float(k+1);float radius=.025+.011*float(k),d=length(q-center);float spot=(1.-smoothstep(radius*.7,radius,d))*(.13+.12*fbm(v_uv*41.+float(k)));light+=u_color*spot*vec3(1.,.7+.3*sin(float(k)),.65+.35*cos(float(k)));}
 float halo=exp(-pow((length(q)-u_halo)/.012,2.))*.14;float star=exp(-length(q-p)*40.);vec4 c=at(u_img,v_uv);outColor=vec4(c.rgb+(light+u_color*(halo+star))*u_intensity,c.a);}`,
 godrays:`uniform sampler2D u_img,u_other;uniform float u_x,u_y,u_length,u_intensity,u_decay;
 void main(){vec2 stepUV=(vec2(u_x,u_y)-v_uv)*u_length/32.;vec3 sum=vec3(0);float weight=1.,total=0.;for(int j=0;j<32;j++){sum+=at(u_other,v_uv+stepUV*float(j)).rgb*weight;total+=weight;weight*=u_decay;}vec4 c=at(u_img,v_uv);outColor=vec4(c.rgb+sum/max(total,.0001)*u_intensity,c.a);}`,
 sharpen:`uniform sampler2D u_img,u_other;uniform float u_intensity;
 void main(){vec4 c=at(u_img,v_uv),b=at(u_other,v_uv);vec3 rgb=unpremul(c).rgb+u_intensity*(unpremul(c).rgb-unpremul(b).rgb);outColor=vec4(max(rgb,vec3(0))*c.a,c.a);}`,
 ca:`uniform sampler2D u_img;uniform float u_intensity;
 void main(){vec2 p=v_uv-.5;vec2 dir=length(p)>0.?normalize(p):vec2(0);vec4 c=at(u_img,v_uv),r=unpremul(at(u_img,v_uv-dir*u_intensity)),b=unpremul(at(u_img,v_uv+dir*u_intensity));outColor=vec4(vec3(r.r,unpremul(c).g,b.b)*c.a,c.a);}`,
 distort:`uniform sampler2D u_img;uniform float u_k1,u_k2;
 void main(){vec2 p=v_uv-.5;float rd=length(p),r=rd;for(int j=0;j<10;j++){float r2=r*r;r-= (r*(1.+u_k1*r2+u_k2*r2*r2)-rd)/max(.1,1.+3.*u_k1*r2+5.*u_k2*r2*r2);}vec2 q=.5+p*(rd>0.?r/rd:1.);outColor=any(lessThan(q,vec2(0)))||any(greaterThan(q,vec2(1)))?vec4(0):at(u_img,q);}`,
 curve:`uniform sampler2D u_img,u_curve;uniform int u_space;
 void main(){vec4 c=unpremul(at(u_img,v_uv));vec3 v=u_space==1?s2l(c.rgb):c.rgb;float l=lum(v),t=texture(u_curve,vec2((clamp(l,0.,1.)*255.+.5)/256.,.5)).r;v=l>.00001?v*t/l:vec3(t);if(u_space==1)v=l2s(v);outColor=vec4(v*c.a,c.a);}`,
 lut:`precision highp sampler3D;uniform sampler2D u_img;uniform sampler3D u_lut;uniform int u_space,u_display;uniform float u_size,u_strength;uniform vec3 u_min,u_max;
 void main(){vec4 c=unpremul(at(u_img,v_uv));vec3 v=u_space==1?s2l(c.rgb):c.rgb;if(u_display==1)v=l2s(v);vec3 coord=(clamp((v-u_min)/(u_max-u_min),0.,1.)*(u_size-1.)+.5)/u_size;vec3 mapped=texture(u_lut,coord).rgb;v=mix(v,mapped,u_strength);if(u_display==1)v=s2l(v);if(u_space==1)v=l2s(v);outColor=vec4(v*c.a,c.a);}`
};
