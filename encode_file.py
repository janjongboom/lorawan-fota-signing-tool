#!/usr/bin/python
import copy
import random
import math
import sys
import getopt
import struct

from pprint import pprint

def prbs23(start):
  x = int(start)
  b0 = x&1
  b1 = (x & 32)/32
  x = math.floor(x/2) + ((b0^b1) * math.pow(2,22))
  return x

def is_power_2(num):
  return num != 0 and ((num & (num - 1)) == 0)

def matrix_line(line_number, line_length):
  matrix_line = [0] * line_length # array with line_length number of zero's

  s = 0

  m=0
  if(is_power_2(line_length)):
    m=1

  x = 1+(1001*line_number)

  nb_coefficient = 0
  while (nb_coefficient<math.floor(line_length/2)):
    r = int(math.pow(2, 16))
    while (r>=line_length):
      x = prbs23(x)
      r=int((x)%(line_length+m))
    matrix_line[r] = 1
    nb_coefficient += 1

  return matrix_line


def main (infile, fragment_size, redundancy):
  fragment_size = int(fragment_size)
  redundancy = int(redundancy)

  fh = open(infile, 'rb')
  binaryarray = []
  try:
      byte = fh.read(1)
      while byte != "":
        binaryarray.extend(struct.unpack("<B", byte))
        byte = fh.read(1)
  finally:
      fh.close
  fh.close()

  if (len(binaryarray)%fragment_size) != 0:
    for i in range(fragment_size-(len(binaryarray)%fragment_size)):
      print i,
      print "Appending 0"
      binaryarray.append(0)

  data = binaryarray

  # data = [0,128,1,32,221,2,0,8,229,2,0,8,231,2,0,8,233,2,0,8,235,2,0,8,237,2,0,8,0,0,0,0,
  #         0,0,0,0,0,0,0,0,0,0,0,0,239,2,0,8,241,2,0,8,0,0,0,0,243,2,0,8,245,2,0,8,
  #         247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,
  #         247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,
  #         247,2,0,8,247,2,0,8,247,2,0,8,61,46,0,8,37,46,0,8,247,2,0,8,49,46,0,8,247,2,0,8,
  #         247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,
  #         247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,
  #         247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,
  #         247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,
  #         247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,
  #         247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,
  #         247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,247,2,0,8,0,0,0,0,
  #         247,2,0,8,247,2,0,8,0,240,2,248,0,240,152,248,10,160,144,232,0,12,130,68,131,68,170,241,1,7,218,69,
  #         1,209,0,240,141,248,175,242,9,14,186,232,15,0,19,240,1,15,24,191,251,26,67,240,1,3,24,71,96,105,0,0,
  #         128,105,0,0,16,58,36,191,120,200,120,193,250,216,82,7,36,191,48,200,48,193,68,191,4,104,12,96,112,71,0,0,
  #         0,35,0,36,0,37,0,38,16,58,40,191,120,193,251,216,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  #         0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  #         0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  #         0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  #         0,0,0,0,0,0,0,0,85,230,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  #         0,0,0,0,0,0,0,0,0,0,0,0,0,9,61,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  #         0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]

  print "Input data"
  print data
  print ""

  rowcount = len(data)/fragment_size

  # split into rows of size fragment_size
  data_rows = [data[i:i + fragment_size] for i in xrange(0, len(data), fragment_size)]
  data_row_count = len(data_rows)

  # add redundancy rows
  for i in range(data_row_count, data_row_count+redundancy):
    newrow = [0] * fragment_size
    data_rows.append(newrow)

  #build redundancy lines
  for i in range(data_row_count, data_row_count+redundancy):
    templine = matrix_line(i-data_row_count+1, data_row_count)

    first=1
    for k in range(data_row_count):
      if(templine[k]==1):
        if(first==1):
          for m in range(fragment_size):
            data_rows[i][m] = data_rows[k][m]
          first = 0
        else:
          for m in range(fragment_size):
            data_rows[i][m] = data_rows[i][m] ^ data_rows[k][m]

  for u in range(data_row_count+redundancy):
    fcnt=int(u+1);
    fcntU = math.floor(fcnt/256)
    fcntL = fcnt-(256*fcntU)
    temp = [8, int(fcntU), int(fcntL)]
    data_rows[u] = temp + data_rows[u]

  datarowsstring = "0x%02X" % data_row_count
  fragmentsizestring = "0x%02X" % fragment_size
  print ("Fragmentation header likely: [  0x02, 0x00, "+datarowsstring+", 0x00, "+fragmentsizestring+", 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]")
  for line in data_rows:
    print(line)


if __name__ == "__main__":
  argv = sys.argv[1:]

  if(len(argv)!=3):
    print ("encode_file.py infile.bin fragment_size redundant_lines")
    exit()

  main(argv[0], argv[1], argv[2])
