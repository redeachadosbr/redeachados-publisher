// Proteção exclusiva para galeria de KITS. Não altera imagens de anúncios individuais.
export function kitImagesLookDuplicated(a,b){
 if(!a||!b||a.length!==b.length||a.length!==20*20*4)return false;
 let rgb=0,compared=0,contrasts=0;
 const luminance=(x,i)=>x[i]*0.299+x[i+1]*0.587+x[i+2]*0.114;
 for(let i=0;i<a.length;i+=4){
  rgb+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
  compared+=3;
 }
 // Perceptual dHash apenas com regiões 20x20 (posições próximas); nunca
 // aceitar uma foto pixel a pixel igual como posição comercial diferente.
 let differing=0,steps=0;
 for(let y=0;y<20;y+=2)for(let x=0;x<19;x+=2){
  const i=(y*20+x)*4,j=i+4;
  differing+=(luminance(a,i)>luminance(a,j))!==(luminance(b,i)>luminance(b,j))?1:0;
  steps++;
 }
 const delta=rgb/compared;
 return delta<13||(delta<31&&differing<=Math.floor(steps*0.13));
}
